import { Color, Label, Layers, MeshRenderer, Node, Sprite, Texture2D, UITransform, Vec3 } from 'cc';
import { GroundDigitAtlas } from './GroundDigitAtlas';
import { addMergedTexturedQuads, addTexturedQuad, GroundQuadSpec, uvFromSpriteFrame } from './GroundQuadMesh';

/** 贴地 mesh 根节点绕 X -90° */
const PANEL_FLAT_EULER_X = -90;
const PANEL_LIFT_Y = 0.006;

/**
 * 各图层之间的高度差（局部 Z，旋转后变为世界 Y）。
 * 同一高度的多个面片会互相 Z-fighting（摄像机一动就闪烁），
 * 所以底板、图标、文字必须像叠纸片一样错开一点点高度。
 */
const LAYER_STEP = 0.0015;

export interface AmountAnchor {
    cx: number;
    cy: number;
    height: number;
}

export interface BakedPurchaseUI {
    panelRoot: Node;
    renderers: MeshRenderer[];
    amountAnchor: AmountAnchor | null;
    textRenderer: MeshRenderer | null;
    setAmount(amount: number): void;
    setAffordable(affordable: boolean, dimWhenUnaffordable: boolean): void;
    destroy(): void;
}

/** 读取预制体 Sprite / Label 布局，烘焙为 DEFAULT 层 Mesh（可被 3D 遮挡） */
export function bakePurchaseUIPrefab(uiRoot: Node, meshParent: Node, uiScale: Vec3): BakedPurchaseUI {
    const scale = uiScale.x;
    const panelRoot = new Node('GroundMesh');
    panelRoot.setParent(meshParent);
    panelRoot.setPosition(0, PANEL_LIFT_Y, 0);
    panelRoot.setRotationFromEuler(PANEL_FLAT_EULER_X, 0, 0);
    panelRoot.layer = Layers.Enum.DEFAULT;

    const renderers: MeshRenderer[] = [];
    const sprites = uiRoot.getComponentsInChildren(Sprite);
    let layerIndex = 0;

    for (const sprite of sprites) {
        if (!sprite.enabled || !sprite.spriteFrame) {
            continue;
        }
        const renderer = _bakeSprite(sprite, uiRoot, panelRoot, scale, layerIndex * LAYER_STEP);
        layerIndex += 1;
        if (renderer) {
            renderers.push(renderer);
        }
    }

    /** 文字始终叠在最上层 */
    const textZOffset = (layerIndex + 1) * LAYER_STEP;
    const amountAnchor = _readAmountAnchor(uiRoot, scale);
    let textRenderer: MeshRenderer | null = null;
    let currentAmount = '';
    let isAffordable = true;
    let dimEnabled = true;

    const api: BakedPurchaseUI = {
        panelRoot,
        renderers,
        amountAnchor,
        textRenderer: null,
        setAmount(amount: number) {
            const text = `${amount}`;
            if (text === currentAmount && textRenderer?.isValid) {
                return;
            }
            currentAmount = text;
            if (textRenderer?.isValid) {
                const idx = renderers.indexOf(textRenderer);
                if (idx >= 0) {
                    renderers.splice(idx, 1);
                }
                textRenderer.node.destroy();
            }
            textRenderer = amountAnchor
                ? _buildAmountMesh(panelRoot, amountAnchor, text, textZOffset)
                : null;
            api.textRenderer = textRenderer;
            if (textRenderer) {
                renderers.push(textRenderer);
            }
            if (!isAffordable && dimEnabled) {
                for (const renderer of renderers) {
                    if (renderer.isValid) {
                        _setRendererAlpha(renderer, 140);
                    }
                }
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
                if (!renderer.isValid) {
                    continue;
                }
                _setRendererAlpha(renderer, alpha);
            }
        },
        destroy() {
            panelRoot.destroy();
        },
    };

    return api;
}

function _bakeSprite(
    sprite: Sprite,
    uiRoot: Node,
    panelRoot: Node,
    scale: number,
    zOffset: number,
): MeshRenderer | null {
    const frame = sprite.spriteFrame;
    const texture = frame?.texture as Texture2D | null;
    if (!frame || !texture) {
        return null;
    }

    const ui = sprite.node.getComponent(UITransform);
    if (!ui) {
        return null;
    }

    const local = _localPosRelativeTo(uiRoot, sprite.node);
    const cx = local.x * scale;
    const cy = local.y * scale;
    const width = ui.contentSize.width * scale;
    const height = ui.contentSize.height * scale;
    const tint = sprite.color.clone();

    return addTexturedQuad(
        panelRoot,
        sprite.node.name,
        texture,
        width,
        height,
        { x: cx, y: cy },
        tint,
        uvFromSpriteFrame(frame),
        zOffset,
    );
}

function _readAmountAnchor(uiRoot: Node, scale: number): AmountAnchor | null {
    const label = uiRoot.getComponentInChildren(Label);
    if (!label) {
        return null;
    }
    const ui = label.node.getComponent(UITransform);
    if (!ui) {
        return null;
    }
    const local = _localPosRelativeTo(uiRoot, label.node);
    return {
        cx: local.x * scale,
        cy: local.y * scale,
        height: ui.contentSize.height * scale,
    };
}

function _buildAmountMesh(panelRoot: Node, anchor: AmountAnchor, text: string, zOffset: number): MeshRenderer {
    const atlas = GroundDigitAtlas.shared;
    const digitH = anchor.height;
    const digitW = digitH * 0.55;
    const spacing = digitW * 0.12;
    const specs: GroundQuadSpec[] = [];

    const groupW = text.length * digitW + Math.max(0, text.length - 1) * spacing;
    let x = anchor.cx - groupW * 0.5 + digitW * 0.5;

    for (const ch of text) {
        specs.push({
            cx: x,
            cy: anchor.cy,
            width: digitW,
            height: digitH,
            uv: atlas.getUv(ch),
        });
        x += digitW + spacing;
    }

    return addMergedTexturedQuads(panelRoot, 'Amount', specs, atlas.texture, Color.WHITE, zOffset);
}

function _localPosRelativeTo(root: Node, node: Node): Vec3 {
    const out = node.position.clone();
    let parent = node.parent;
    while (parent && parent !== root) {
        out.x += parent.position.x;
        out.y += parent.position.y;
        out.z += parent.position.z;
        parent = parent.parent;
    }
    return out;
}

function _setRendererAlpha(renderer: MeshRenderer, alpha: number): void {
    const mat = renderer.getMaterialInstance(0);
    if (!mat) {
        return;
    }
    const c = mat.getProperty('mainColor') as Color ?? Color.WHITE.clone();
    mat.setProperty('mainColor', new Color(c.r, c.g, c.b, alpha));
}
