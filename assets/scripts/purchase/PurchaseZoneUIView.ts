import {
    _decorator,
    Camera,
    Canvas,
    Color,
    Component,
    director,
    gfx,
    Label,
    Layers,
    Node,
    RenderRoot2D,
    Sprite,
    UIRenderer,
} from 'cc';

const { ccclass, property } = _decorator;

/** UI_3D 层（与 3D 相机同屏，配合深度测试） */
export const PURCHASE_UI_LAYER = Layers.Enum.UI_3D;

/**
 * 购买区 UI_3D：RenderRoot2D 渲染在 3D 空间，开启深度测试，可被场景遮挡。
 */
@ccclass('PurchaseZoneUIView')
export class PurchaseZoneUIView extends Component {
    @property({ type: Sprite, tooltip: '底板' })
    bgSprite: Sprite | null = null;

    @property({ type: Label, tooltip: '价格数字' })
    amountLabel: Label | null = null;

    @property({ type: Sprite, tooltip: '货币 icon' })
    coinSprite: Sprite | null = null;

    @property({ type: Sprite, tooltip: '解锁物 icon' })
    rewardSprite: Sprite | null = null;

    @property({ type: Label, tooltip: '加号' })
    plusLabel: Label | null = null;

    @property({ tooltip: '余额不足时变暗' })
    dimWhenUnaffordable = true;

    private _affordable = true;

    onLoad() {
        this._bindNodesIfNeeded();
        this._setupWorldRenderRoot();
    }

    public static applyUi3DLayer(root: Node): void {
        const stack: Node[] = [root];
        while (stack.length > 0) {
            const current = stack.pop()!;
            current.layer = PURCHASE_UI_LAYER;
            for (const child of current.children) {
                stack.push(child);
            }
        }
    }

    public setAmount(amount: number): void {
        if (this.amountLabel) {
            this.amountLabel.string = `${amount}`;
        }
    }

    public setAffordable(affordable: boolean): void {
        this._affordable = affordable;
        if (!this.dimWhenUnaffordable) {
            return;
        }
        const alpha = affordable ? 255 : 140;
        if (this.bgSprite) {
            const c = this.bgSprite.color;
            this.bgSprite.color = new Color(c.r, c.g, c.b, alpha);
        }
        if (this.amountLabel) {
            const c = this.amountLabel.color;
            this.amountLabel.color = new Color(c.r, c.g, c.b, alpha);
        }
        if (this.plusLabel) {
            const c = this.plusLabel.color;
            this.plusLabel.color = new Color(c.r, c.g, c.b, alpha);
        }
        if (this.coinSprite) {
            this.coinSprite.color = new Color(255, 255, 255, alpha);
        }
        if (this.rewardSprite) {
            this.rewardSprite.color = new Color(255, 255, 255, alpha);
        }
    }

    private _bindNodesIfNeeded(): void {
        this.bgSprite = this.bgSprite ?? this.node.getChildByName('Bg')?.getComponent(Sprite) ?? null;
        const content = this.node.getChildByName('Content');
        this.coinSprite = this.coinSprite
            ?? content?.getChildByName('Coin')?.getComponent(Sprite)
            ?? null;
        this.amountLabel = this.amountLabel
            ?? content?.getChildByName('Amount')?.getComponent(Label)
            ?? null;
        this.plusLabel = this.plusLabel
            ?? content?.getChildByName('Plus')?.getComponent(Label)
            ?? null;
        this.rewardSprite = this.rewardSprite
            ?? content?.getChildByName('Reward')?.getComponent(Sprite)
            ?? null;
    }

    /** 使用 RenderRoot2D（非 Canvas），避免屏幕叠层渲染 */
    private _setupWorldRenderRoot(): void {
        const canvas = this.getComponent(Canvas);
        if (canvas) {
            canvas.destroy();
        }
        if (!this.getComponent(RenderRoot2D)) {
            this.node.addComponent(RenderRoot2D);
        }

        const camNode = director.getScene()?.getChildByName('Main Camera');
        const camera = camNode?.getComponent(Camera) ?? null;
        if (camera) {
            camera.visibility |= PURCHASE_UI_LAYER;
        }

        this._enableDepthForTree(this.node);
    }

    /** 2D UI 默认不写深度，需开启后才能与 3D 物体正确遮挡 */
    private _enableDepthForTree(root: Node): void {
        const renderer = root.getComponent(UIRenderer);
        if (renderer) {
            this._enableDepth(renderer);
        }
        for (const child of root.children) {
            this._enableDepthForTree(child);
        }
    }

    private _enableDepth(renderer: UIRenderer): void {
        const material = renderer.getMaterialInstance(0);
        if (!material) {
            return;
        }
        material.overridePipelineStates({
            depthStencilState: {
                depthTest: true,
                depthWrite: true,
                depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
            },
        }, 0);
    }
}
