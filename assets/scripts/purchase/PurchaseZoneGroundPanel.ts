import {
    _decorator,
    Color,
    Component,
    Layers,
    MeshRenderer,
    Node,
    resources,
    Texture2D,
    Vec3,
} from 'cc';
import { GroundDigitAtlas } from './GroundDigitAtlas';
import { addMergedTexturedQuads, addTexturedQuad, GroundQuadSpec } from './GroundQuadMesh';
import {
    PURCHASE_COIN_ICON_PATH,
    PURCHASE_REWARD_ICON_PATH,
    PURCHASE_ZONE_BG_PATH,
} from './PurchaseZonePaths';

const { ccclass, property } = _decorator;

/** 绕 X -90°：quad 平铺在 XZ 地面 */
const PANEL_FLAT_EULER_X = -90;

/** 贴地 UI 整体抬高，避免 Z-fighting */
const PANEL_Y = 0.002;

/**
 * 购买区贴地贴花：纯 MeshRenderer + builtin-unlit。
 * - 与 3D 同深度，可被栅栏遮挡
 * - 无 RenderRoot2D / Label / Canvas（Playable 友好）
 * - 文字合并为 1 个 Mesh（1 DrawCall）
 */
@ccclass('PurchaseZoneGroundPanel')
export class PurchaseZoneGroundPanel extends Component {
    @property({ tooltip: '余额不足时变暗' })
    dimWhenUnaffordable = true;

    private _panelRoot: Node | null = null;
    private readonly _renderers: MeshRenderer[] = [];
    private _textRenderer: MeshRenderer | null = null;
    private _amount = 0;
    private _affordable = true;
    private _pendingLoads = 0;

    public build(amount: number): void {
        if (this._panelRoot?.isValid) {
            return;
        }

        this._amount = amount;
        this._panelRoot = new Node('PanelRoot');
        this._panelRoot.setParent(this.node);
        this._panelRoot.setPosition(0, PANEL_Y, 0);
        this._panelRoot.setRotationFromEuler(PANEL_FLAT_EULER_X, 0, 0);
        this._panelRoot.layer = Layers.Enum.DEFAULT;

        this._buildTextMesh(amount);

        this._pendingLoads = 3;
        this._loadTexture(PURCHASE_ZONE_BG_PATH, (tex) => {
            this._addBg(tex);
            this._onPieceLoaded();
        });
        this._loadTexture(PURCHASE_COIN_ICON_PATH, (tex) => {
            const renderer = addTexturedQuad(this._panelRoot!, 'Coin', tex, 0.42, 0.42, { x: -0.72, y: 0 }, Color.WHITE);
            this._renderers.push(renderer);
            this._onPieceLoaded();
        });
        this._loadTexture(PURCHASE_REWARD_ICON_PATH, (tex) => {
            const renderer = addTexturedQuad(this._panelRoot!, 'Reward', tex, 0.42, 0.42, { x: 0.72, y: 0 }, Color.WHITE);
            this._renderers.push(renderer);
            this._onPieceLoaded();
        });
    }

    public setAmount(amount: number): void {
        if (this._amount === amount) {
            return;
        }
        this._amount = amount;
        this._rebuildTextMesh(amount);
    }

    public setAffordable(affordable: boolean): void {
        if (this._affordable === affordable) {
            return;
        }
        this._affordable = affordable;
        if (!this.dimWhenUnaffordable) {
            return;
        }
        const alpha = affordable ? 255 : 140;
        for (const renderer of this._renderers) {
            this._setRendererAlpha(renderer, alpha);
        }
        if (this._textRenderer) {
            this._setRendererAlpha(this._textRenderer, alpha);
        }
    }

    private _onPieceLoaded(): void {
        this._pendingLoads -= 1;
        if (this._pendingLoads > 0) {
            return;
        }
        if (!this.dimWhenUnaffordable || this._affordable) {
            return;
        }
        this.setAffordable(this._affordable);
    }

    private _addBg(texture: Texture2D): void {
        if (!this._panelRoot?.isValid) {
            return;
        }
        const renderer = addTexturedQuad(
            this._panelRoot,
            'Bg',
            texture,
            2.2,
            0.55,
            { x: 0, y: 0 },
            new Color(140, 95, 55, 255),
        );
        this._renderers.push(renderer);
    }

    private _buildTextMesh(amount: number): void {
        if (!this._panelRoot?.isValid) {
            return;
        }
        this._textRenderer?.node.destroy();
        this._textRenderer = null;

        const atlas = GroundDigitAtlas.shared;
        const specs = this._layoutAmountAndPlus(`${amount}`);
        this._textRenderer = addMergedTexturedQuads(
            this._panelRoot,
            'Text',
            specs,
            atlas.texture,
            Color.WHITE,
        );
    }

    private _rebuildTextMesh(amount: number): void {
        if (!this._panelRoot?.isValid) {
            return;
        }
        this._buildTextMesh(amount);
        if (this.dimWhenUnaffordable && !this._affordable && this._textRenderer) {
            this._setRendererAlpha(this._textRenderer, 140);
        }
    }

    /** [coin] [50] [+] [reward] 布局 */
    private _layoutAmountAndPlus(amountText: string): GroundQuadSpec[] {
        const digitW = 0.13;
        const digitH = 0.26;
        const spacing = 0.02;
        const atlas = GroundDigitAtlas.shared;

        const specs: GroundQuadSpec[] = [];
        const digitCount = amountText.length;
        const groupW = digitCount * digitW + Math.max(0, digitCount - 1) * spacing;
        let x = -0.12 - groupW * 0.5 + digitW * 0.5;

        for (const ch of amountText) {
            const uv = atlas.getUv(ch);
            specs.push({
                cx: x,
                cy: 0,
                width: digitW,
                height: digitH,
                cornerUvs: [uv.u0, uv.v1, uv.u1, uv.v1, uv.u1, uv.v0, uv.u0, uv.v0],
            });
            x += digitW + spacing;
        }

        const plusUv = atlas.getUv('+');
        specs.push({
            cx: 0.28,
            cy: 0,
            width: 0.12,
            height: digitH,
            cornerUvs: [plusUv.u0, plusUv.v1, plusUv.u1, plusUv.v1, plusUv.u1, plusUv.v0, plusUv.u0, plusUv.v0],
        });
        return specs;
    }

    private _setRendererAlpha(renderer: MeshRenderer, alpha: number): void {
        const mat = renderer.getMaterialInstance(0);
        if (!mat) {
            return;
        }
        const c = mat.getProperty('mainColor') as Color ?? Color.WHITE.clone();
        mat.setProperty('mainColor', new Color(c.r, c.g, c.b, alpha));
    }

    private _loadTexture(path: string, onLoaded: (tex: Texture2D) => void): void {
        resources.load(`${path}/texture`, Texture2D, (err, tex) => {
            if (!err && tex && this._panelRoot?.isValid) {
                onLoaded(tex);
                return;
            }
            resources.load(path, Texture2D, (err2, tex2) => {
                if (!err2 && tex2 && this._panelRoot?.isValid) {
                    onLoaded(tex2);
                } else {
                    this._onPieceLoaded();
                }
            });
        });
    }
}
