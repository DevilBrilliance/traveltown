import {
    Color,
    Label,
    Layers,
    MeshRenderer,
    Node,
    Texture2D,
    Sprite,
    UITransform,
    Vec3,
} from 'cc';
import { addTexturedQuad, uvCornersFromSpriteFrame } from './GroundQuadMesh';

/** 贴地 mesh 根节点绕 X -90° */
const PANEL_FLAT_EULER_X = -90;
const PANEL_LIFT_Y = 0.006;
const LAYER_STEP = 0.0015;

const _tmpWorld = new Vec3();
const _tmpLocal = new Vec3();

interface TextMeshEntry {
    renderer: MeshRenderer;
    texture: Texture2D;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    widthPx: number;
    heightPx: number;
    fontSize: number;
    bold: boolean;
    textColor: Color;
    outlineColor: Color;
    outlineWidth: number;
}

export interface BakedPurchaseUI {
    panelRoot: Node;
    renderers: MeshRenderer[];
    setAmount(amount: number): void;
    setAffordable(affordable: boolean, dimWhenUnaffordable: boolean): void;
    destroy(): void;
}

/** 读取预制体布局：Sprite + Text 全部烘焙为可遮挡 Mesh */
export function bakePurchaseUIPrefab(uiRoot: Node, meshParent: Node, uiScale: Vec3): BakedPurchaseUI {
    const scale = uiScale.x;
    const panelRoot = new Node('GroundMesh');
    panelRoot.setParent(meshParent);
    panelRoot.setPosition(0, PANEL_LIFT_Y, 0);
    panelRoot.setRotationFromEuler(PANEL_FLAT_EULER_X, 0, 0);
    panelRoot.layer = Layers.Enum.DEFAULT;

    const rootUi = uiRoot.getComponent(UITransform);
    const renderers: MeshRenderer[] = [];
    const textEntries: TextMeshEntry[] = [];
    let layerIndex = 0;

    for (const sprite of uiRoot.getComponentsInChildren(Sprite)) {
        if (!sprite.enabled || !sprite.spriteFrame) {
            continue;
        }
        const renderer = _bakeSprite(sprite, rootUi, panelRoot, scale, layerIndex * LAYER_STEP);
        layerIndex += 1;
        if (renderer) {
            renderers.push(renderer);
        }
    }

    const textZOffset = (layerIndex + 1) * LAYER_STEP;
    for (const label of uiRoot.getComponentsInChildren(Label)) {
        if (!label.enabled) {
            continue;
        }
        const entry = _bakeLabelToMesh(label, rootUi, panelRoot, scale, textZOffset);
        if (entry) {
            textEntries.push(entry);
            renderers.push(entry.renderer);
        }
    }

    let isAffordable = true;
    let dimEnabled = true;

    const api: BakedPurchaseUI = {
        panelRoot,
        renderers,
        setAmount(amount: number) {
            const text = `${amount}`;
            for (const entry of textEntries) {
                _drawText(entry, text);
            }
        },
        setAffordable(nextAffordable: boolean, dimWhenUnaffordable: boolean) {
            dimEnabled = dimWhenUnaffordable;
            isAffordable = nextAffordable;
            if (!dimWhenUnaffordable) {
                return;
            }
            const alpha = nextAffordable ? 255 : 140;
            for (const renderer of renderers) {
                if (renderer.isValid) {
                    _setRendererAlpha(renderer, alpha);
                }
            }
        },
        destroy() {
            for (const entry of textEntries) {
                entry.texture.destroy();
            }
            panelRoot.destroy();
        },
    };

    return api;
}

function _bakeSprite(
    sprite: Sprite,
    rootUi: UITransform | null,
    panelRoot: Node,
    scale: number,
    zOffset: number,
): MeshRenderer | null {
    const frame = sprite.spriteFrame;
    const texture = frame?.texture as Texture2D | null;
    const nodeUi = sprite.node.getComponent(UITransform);
    if (!frame || !texture || !nodeUi) {
        return null;
    }

    const layout = _layoutInRoot(rootUi, sprite.node, nodeUi, scale);
    return addTexturedQuad(
        panelRoot,
        sprite.node.name,
        texture,
        layout.width,
        layout.height,
        { x: layout.cx, y: layout.cy },
        sprite.color.clone(),
        uvCornersFromSpriteFrame(frame),
        zOffset,
    );
}

function _bakeLabelToMesh(
    label: Label,
    rootUi: UITransform | null,
    panelRoot: Node,
    scale: number,
    zOffset: number,
): TextMeshEntry | null {
    const nodeUi = label.node.getComponent(UITransform);
    if (!nodeUi) {
        return null;
    }

    const layout = _layoutInRoot(rootUi, label.node, nodeUi, scale);
    const widthPx = Math.max(64, Math.ceil(nodeUi.contentSize.width * 2));
    const heightPx = Math.max(64, Math.ceil(nodeUi.contentSize.height * 2));
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }

    const texture = new Texture2D();
    texture.reset({ width: widthPx, height: heightPx });
    texture.uploadData(canvas);

    const renderer = addTexturedQuad(
        panelRoot,
        label.node.name,
        texture,
        layout.width,
        layout.height,
        { x: layout.cx, y: layout.cy },
        Color.WHITE,
        undefined,
        zOffset,
    );

    return {
        renderer,
        texture,
        canvas,
        ctx,
        widthPx,
        heightPx,
        fontSize: Math.max(12, Math.round(label.fontSize * 2)),
        bold: label.isBold,
        textColor: label.color.clone(),
        outlineColor: label.outlineColor.clone(),
        outlineWidth: Math.max(0, Math.round(label.outlineWidth * 2)),
    };
}

function _layoutInRoot(
    rootUi: UITransform | null,
    node: Node,
    nodeUi: UITransform,
    scale: number,
): { cx: number; cy: number; width: number; height: number } {
    if (rootUi) {
        nodeUi.convertToWorldSpaceAR(Vec3.ZERO, _tmpWorld);
        rootUi.convertToNodeSpaceAR(_tmpWorld, _tmpLocal);
    } else {
        _tmpLocal.set(node.position);
    }
    return {
        cx: _tmpLocal.x * scale,
        cy: _tmpLocal.y * scale,
        width: nodeUi.contentSize.width * scale,
        height: nodeUi.contentSize.height * scale,
    };
}

function _drawText(entry: TextMeshEntry, text: string): void {
    const { ctx, canvas, widthPx, heightPx, fontSize, bold, textColor, outlineColor, outlineWidth, texture } = entry;
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${bold ? 'bold ' : ''}${fontSize}px Arial`;
    ctx.lineJoin = 'round';
    if (outlineWidth > 0) {
        ctx.strokeStyle = `rgba(${outlineColor.r}, ${outlineColor.g}, ${outlineColor.b}, ${outlineColor.a / 255})`;
        ctx.lineWidth = outlineWidth;
        ctx.strokeText(text, widthPx * 0.5, heightPx * 0.5);
    }
    ctx.fillStyle = `rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, ${textColor.a / 255})`;
    ctx.fillText(text, widthPx * 0.5, heightPx * 0.5);
    texture.uploadData(canvas);
}

function _setRendererAlpha(renderer: MeshRenderer, alpha: number): void {
    const mat = renderer.getMaterialInstance(0);
    if (!mat) {
        return;
    }
    const c = mat.getProperty('mainColor') as Color ?? Color.WHITE.clone();
    mat.setProperty('mainColor', new Color(c.r, c.g, c.b, alpha));
}
