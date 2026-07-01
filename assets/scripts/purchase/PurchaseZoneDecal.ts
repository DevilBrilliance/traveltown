import {
    _decorator,
    Color,
    Component,
    gfx,
    ImageAsset,
    Layers,
    Material,
    MeshRenderer,
    Node,
    resources,
    Texture2D,
    utils,
    Vec3,
} from 'cc';
import {
    PURCHASE_COIN_ICON_PATH,
    PURCHASE_REWARD_ICON_PATH,
    PURCHASE_ZONE_BG_COMPLETE_PATH,
    PURCHASE_ZONE_BG_PATH,
} from './PurchaseZonePaths';

const { ccclass, property } = _decorator;

/** 贴地面板绕 X -90° 平铺 */
const FLAT_EULER_X = -90;
/** 防止和地面 Z-fight */
const LIFT_Y = 0.006;

/**
 * 购买区地面贴花（简化版）：
 * - 底板 / 图标 / 进度条 各一个 Quad（MeshRenderer，DEFAULT 层，可被 3D 遮挡）
 * - 文字用 canvas 绘制成纹理，同样是 Quad
 * - 共 ~4 DrawCall，无 RenderRoot2D / Label / Canvas
 */
@ccclass('PurchaseZoneDecal')
export class PurchaseZoneDecal extends Component {
    @property({ tooltip: '余额不足时底板变暗' })
    dimWhenUnaffordable = true;

    // ---- layout ----
    /** 底板世界尺寸 */
    @property bgWidth = 2.2;
    @property bgHeight = 0.55;
    /** 图标尺寸 */
    @property iconSize = 0.4;
    /** 图标距底板中心 X 偏移 */
    @property coinOffsetX = -0.75;
    @property rewardOffsetX = 0.72;
    /** 数字区域宽高（世界单位） */
    @property amountWidth = 0.6;
    @property amountHeight = 0.28;
    /** 数字区域 X 偏移（相对底板中心） */
    @property amountOffsetX = -0.18;
    /** 进度条（蓝框）显示尺寸（建议 <= bgWidth） */
    @property progressWidth = 2.0;
    @property progressHeight = 0.5;

    private _root: Node | null = null;
    private _bgRenderer: MeshRenderer | null = null;
    private _progressRenderer: MeshRenderer | null = null;
    private _amountRenderer: MeshRenderer | null = null;
    private _amountTexture: Texture2D | null = null;
    private _amountCanvas: HTMLCanvasElement | null = null;
    private _amountCtx: CanvasRenderingContext2D | null = null;
    private _bgTex: Texture2D | null = null;
    private _bgCompleteTex: Texture2D | null = null;
    private _progressTex: Texture2D | null = null;
    private _progress = 0;
    private _completed = false;

    onLoad() {
        this._buildRoot();
    }

    onDestroy() {
        this._amountTexture?.destroy();
    }

    /** 0~1 填充进度；1 = 达成，自动切换底板贴图 */
    public setProgress(value: number): void {
        const clamped = Math.max(0, Math.min(1, value));
        this._progress = clamped;

        if (this._progressRenderer?.node.isValid) {
            // 通过 scale X 实现 filled 效果：从左向右填充
            const fullW = this.progressWidth;
            const filledW = fullW * clamped;
            this._progressRenderer.node.setScale(filledW, this.progressHeight, 1);
            // 进度节点 X 居中对齐左对齐填充
            this._progressRenderer.node.setPosition(
                (filledW - fullW) * 0.5,
                0,
                LIFT_Y * 2,
            );
        }

        if (clamped >= 1 && !this._completed) {
            this._setCompleted();
        }
    }

    public setAmount(amount: number): void {
        this._drawAmount(`${amount}`);
    }

    public setAffordable(affordable: boolean): void {
        if (!this.dimWhenUnaffordable || !this._bgRenderer) {
            return;
        }
        const alpha = affordable ? 255 : 160;
        _setMeshAlpha(this._bgRenderer, alpha);
    }

    private _buildRoot(): void {
        this._root = new Node('DecalRoot');
        this._root.setParent(this.node);
        this._root.setPosition(0, LIFT_Y, 0);
        this._root.setRotationFromEuler(FLAT_EULER_X, 0, 0);
        this._root.layer = Layers.Enum.DEFAULT;

        // 底板（初始不可见，等贴图加载）
        this._bgRenderer = _addQuad(this._root, 'Bg', this.bgWidth, this.bgHeight, new Vec3(0, 0, 0));
        // 进度条（蓝框，scale X 控制填充，初始宽 0）
        this._progressRenderer = _addQuad(this._root, 'Progress', 0, this.progressHeight, new Vec3(0, 0, LIFT_Y));
        // 文字
        this._amountRenderer = _addQuad(this._root, 'Amount', this.amountWidth, this.amountHeight, new Vec3(this.amountOffsetX, 0, LIFT_Y * 3));
        this._buildAmountCanvas();

        // 异步加载贴图
        this._loadTex(PURCHASE_ZONE_BG_PATH, (tex) => {
            this._bgTex = tex;
            if (this._bgRenderer) {
                _applyTex(this._bgRenderer, tex);
            }
        });
        this._loadTex(PURCHASE_ZONE_BG_COMPLETE_PATH, (tex) => {
            this._bgCompleteTex = tex;
        });
        this._loadTex(PURCHASE_REWARD_ICON_PATH, (tex) => {
            const r = _addQuad(this._root!, 'Reward', this.iconSize, this.iconSize, new Vec3(this.rewardOffsetX, 0, LIFT_Y * 2));
            _applyTex(r, tex);
        });
        this._loadTex(PURCHASE_COIN_ICON_PATH, (tex) => {
            const r = _addQuad(this._root!, 'Coin', this.iconSize, this.iconSize, new Vec3(this.coinOffsetX, 0, LIFT_Y * 2));
            _applyTex(r, tex);
        });
    }

    private _buildAmountCanvas(): void {
        const PX = 128;
        const canvas = document.createElement('canvas');
        canvas.width = PX;
        canvas.height = PX;
        const ctx = canvas.getContext('2d');
        if (!ctx || !this._amountRenderer) {
            return;
        }
        this._amountCanvas = canvas;
        this._amountCtx = ctx;

        const tex = new Texture2D();
        tex.reset({ width: PX, height: PX });
        tex.uploadData(canvas);
        this._amountTexture = tex;
        _applyTex(this._amountRenderer, tex);

        this._drawAmount('?');
    }

    private _drawAmount(text: string): void {
        const canvas = this._amountCanvas;
        const ctx = this._amountCtx;
        const tex = this._amountTexture;
        if (!canvas || !ctx || !tex) {
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 56px Arial';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(30,30,30,1)';
        ctx.lineWidth = 6;
        ctx.strokeText(text, W * 0.5, H * 0.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, W * 0.5, H * 0.5);
        tex.uploadData(canvas);
    }

    private _setCompleted(): void {
        this._completed = true;
        if (this._bgCompleteTex && this._bgRenderer) {
            _applyTex(this._bgRenderer, this._bgCompleteTex);
        }
        // 进度条满后隐藏（已换背景，不再需要进度覆盖）
        if (this._progressRenderer?.node.isValid) {
            this._progressRenderer.node.active = false;
        }
    }

    private _loadTex(path: string, cb: (t: Texture2D) => void): void {
        resources.load(`${path}/texture`, Texture2D, (err, tex) => {
            if (!err && tex && this.isValid) {
                cb(tex);
                return;
            }
            resources.load(path, Texture2D, (err2, tex2) => {
                if (!err2 && tex2 && this.isValid) {
                    cb(tex2);
                }
            });
        });
    }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function _makeDecalMaterial(texture: Texture2D): Material {
    const mat = new Material();
    mat.initialize({
        effectName: 'builtin-unlit',
        defines: { USE_TEXTURE: true },
        states: {
            rasterizerState: { cullMode: gfx.CullMode.NONE },
            depthStencilState: {
                depthTest: true,
                depthWrite: true,
                depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
            },
            blendState: {
                targets: [{
                    blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    blendEq: gfx.BlendOp.ADD,
                    blendSrcAlpha: gfx.BlendFactor.ONE,
                    blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    blendAlphaEq: gfx.BlendOp.ADD,
                }],
            },
        },
    });
    mat.setProperty('mainTexture', texture);
    mat.setProperty('mainColor', Color.WHITE);
    return mat;
}

function _addQuad(parent: Node, name: string, w: number, h: number, localPos: Vec3): MeshRenderer {
    const node = new Node(name);
    node.setParent(parent);
    node.setPosition(localPos);
    node.setScale(w, h, 1);
    node.layer = parent.layer;
    const r = node.addComponent(MeshRenderer);
    r.mesh = utils.MeshUtils.createMesh({
        positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
        uvs: [0, 0, 1, 0, 1, 1, 0, 1],
        indices: [0, 1, 2, 0, 2, 3],
    });
    // 占位空白材质，等贴图加载后替换
    const placeholderTex = new Texture2D();
    placeholderTex.reset({ width: 1, height: 1 });
    const pixels = new Uint8Array([0, 0, 0, 0]);
    placeholderTex.uploadData(pixels);
    r.material = _makeDecalMaterial(placeholderTex);
    return r;
}

function _applyTex(renderer: MeshRenderer, tex: Texture2D): void {
    const mat = renderer.getMaterialInstance(0);
    if (mat) {
        mat.setProperty('mainTexture', tex);
    } else {
        renderer.material = _makeDecalMaterial(tex);
    }
}

function _setMeshAlpha(renderer: MeshRenderer, alpha: number): void {
    const mat = renderer.getMaterialInstance(0);
    if (!mat) {
        return;
    }
    const c = mat.getProperty('mainColor') as Color ?? Color.WHITE.clone();
    mat.setProperty('mainColor', new Color(c.r, c.g, c.b, alpha));
}
