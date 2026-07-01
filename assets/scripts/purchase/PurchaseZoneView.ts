import {
    _decorator,
    Color,
    Component,
    gfx,
    Label,
    Layers,
    Material,
    MeshRenderer,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    utils,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 购买区世界 UI — MeshRenderer 深度正确版
 *
 * 关键参数说明
 * -----------
 * depthTest: true  → 被玩家、栅栏等所有 3D 物体正确遮挡
 * depthWrite: false → 透明区域不写深度值，不会在换角度时破坏其他物体显示
 * 层级 Z 偏移      → 在 this.node 局部空间沿 Z 轴分层
 *                    经 -90°X 旋转后 Z 映射为世界 Y（离地高度），排序稳定
 *
 * 纹理来源
 * -------
 * Sprite 节点：直接引用已加载的 SpriteFrame.texture（不复制像素，零开销）
 * Label 节点：canvas2d 按同款字体设置绘制后上传
 */
@ccclass('PurchaseZoneView')
export class PurchaseZoneView extends Component {
    @property({ tooltip: '余额不足时 UI 变暗' })
    dimWhenUnaffordable = true;

    private _quads: Array<{ renderer: MeshRenderer; mat: Material }> = [];
    private _filledRenderer: MeshRenderer | null = null;
    private _amountTex: Texture2D | null = null;
    private _amountRenderer: MeshRenderer | null = null;
    private _amountString = '';
    private _labelFontSize = 60;

    /** 每层的 Z 偏移（局部 Z → 世界 Y，值越大离地越高，越靠近摄像机） */
    private static readonly LAYER_Z = 0.001;

    public setup(uiRoot: Node, uiScale: Vec3): void {
        this.node.setRotationFromEuler(-90, 0, 0);
        this.node.setScale(uiScale);
        this.node.layer = Layers.Enum.DEFAULT;

        let layer = 0;

        // ─── Sprite 节点 → MeshRenderer Quad ─────────────────────────────
        for (const sprite of uiRoot.getComponentsInChildren(Sprite)) {
            if (!sprite.spriteFrame) {
                continue;
            }
            const pos = this._accumPos(sprite.node, uiRoot);
            const tr = sprite.node.getComponent(UITransform);
            const w = tr?.width ?? 100;
            const h = tr?.height ?? 100;

            const renderer = this._addSpriteQuad(
                sprite.node.name,
                sprite.spriteFrame,
                sprite.color,
                pos.x, pos.y,
                w, h,
                layer * PurchaseZoneView.LAYER_Z,
            );

            if (sprite.node.name === 'filled') {
                this._filledRenderer = renderer;
                renderer.node.setScale(0, 1, 1); // 初始隐藏
            }

            layer++;
        }

        // ─── Label 节点 → canvas2d 纹理 Quad ─────────────────────────────
        const label = uiRoot.getComponentInChildren(Label);
        if (label) {
            const pos = this._accumPos(label.node, uiRoot);
            const fs = label.fontSize;
            // 显示尺寸基于字号，保证在世界空间里足够大
            const lw = fs * 5;
            const lh = fs * 2;

            this._labelFontSize = fs;
            this._amountString = label.string;
            this._amountTex = this._makeTextTex(label.string, fs, label.color);
            if (this._amountTex) {
                this._amountRenderer = this._addPlainQuad(
                    'Amount',
                    this._amountTex,
                    lw, lh,
                    pos.x, pos.y,
                    layer * PurchaseZoneView.LAYER_Z,
                );
                layer++;
            }
        }

        uiRoot.destroy();
    }

    public setAmount(amount: number): void {
        const s = `${amount}`;
        if (s === this._amountString || !this._amountTex) {
            return;
        }
        this._amountString = s;
        const canvas = document.createElement('canvas');
        canvas.width = this._amountTex.width;
        canvas.height = this._amountTex.height;
        this._paintText(canvas.getContext('2d')!, s, this._labelFontSize * 2, Color.WHITE);
        this._amountTex.uploadData(canvas);
    }

    public setAffordable(affordable: boolean): void {
        if (!this.dimWhenUnaffordable) {
            return;
        }
        const a = affordable ? 255 : 140;
        for (const { mat } of this._quads) {
            const c = mat.getProperty('mainColor') as Color ?? Color.WHITE;
            mat.setProperty('mainColor', new Color(c.r, c.g, c.b, a));
        }
    }

    public setProgress(ratio: number): void {
        if (this._filledRenderer) {
            this._filledRenderer.node.setScale(Math.max(0, Math.min(1, ratio)), 1, 1);
        }
    }

    onDestroy(): void {
        this._amountTex?.destroy();
    }

    // ─── private ────────────────────────────────────────────────────────────

    private _accumPos(target: Node, root: Node): { x: number; y: number } {
        let x = 0;
        let y = 0;
        let cur: Node | null = target;
        while (cur && cur !== root) {
            x += cur.position.x;
            y += cur.position.y;
            cur = cur.parent;
        }
        return { x, y };
    }

    private _addSpriteQuad(
        name: string,
        frame: SpriteFrame,
        tint: Color,
        cx: number, cy: number,
        w: number, h: number,
        zOff: number,
    ): MeshRenderer {
        const uv = this._frameUV(frame);
        const tex = frame.texture as Texture2D;
        const mesh = this._buildQuadMesh(cx, cy, w, h, uv.u0, uv.v0, uv.u1, uv.v1);
        const mat = this._buildMat(tex, tint);
        return this._attachRenderer(name, mesh, mat, zOff);
    }

    private _addPlainQuad(
        name: string,
        tex: Texture2D,
        w: number, h: number,
        cx: number, cy: number,
        zOff: number,
    ): MeshRenderer {
        // canvas2d 上传后 V 轴与 OpenGL 相反，只翻转 V（保持 U 水平方向不变）
        const mesh = this._buildQuadMesh(cx, cy, w, h, 0, 1, 1, 0);
        const mat = this._buildMat(tex, Color.WHITE);
        return this._attachRenderer(name, mesh, mat, zOff);
    }

    private _attachRenderer(name: string, mesh: any, mat: Material, zOff: number): MeshRenderer {
        const node = new Node(name);
        node.setParent(this.node);
        node.setPosition(0, 0, zOff);
        node.layer = Layers.Enum.DEFAULT;
        const r = node.addComponent(MeshRenderer);
        r.mesh = mesh;
        r.setMaterial(mat, 0);
        this._quads.push({ renderer: r, mat });
        return r;
    }

    private _buildQuadMesh(cx: number, cy: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number) {
        return utils.MeshUtils.createMesh({
            positions: [
                cx - w / 2, cy - h / 2, 0,
                cx + w / 2, cy - h / 2, 0,
                cx + w / 2, cy + h / 2, 0,
                cx - w / 2, cy + h / 2, 0,
            ],
            uvs: [u0, v0, u1, v0, u1, v1, u0, v1],
            indices: [0, 1, 2, 0, 2, 3],
        });
    }

    /**
     * depthTest: true  → 被玩家/栅栏遮挡 ✓
     * depthWrite: false → 透明区域不写深度，换角度不变形 ✓
     */
    private _buildMat(tex: Texture2D, tint: Color): Material {
        const mat = new Material();
        mat.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_TEXTURE: true },
            states: {
                rasterizerState: { cullMode: gfx.CullMode.NONE },
                depthStencilState: {
                    depthTest: true,
                    depthWrite: false,
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
        mat.setProperty('mainTexture', tex);
        mat.setProperty('mainColor', tint);
        return mat;
    }

    private _frameUV(frame: SpriteFrame): { u0: number; v0: number; u1: number; v1: number } {
        const uv = frame.uv;
        if (uv?.length >= 8) {
            // SpriteFrame.uv: [bl.u, bl.v, br.u, br.v, tl.u, tl.v, tr.u, tr.v]
            return {
                u0: uv[0],          // left
                v0: uv[1],          // bottom
                u1: uv[2],          // right
                v1: uv[5],          // top
            };
        }
        const tex = frame.texture as Texture2D;
        const r = frame.rect;
        const tw = tex.width;
        const th = tex.height;
        const v0 = 1 - (r.y + r.height) / th;
        const v1 = 1 - r.y / th;
        return { u0: r.x / tw, v0, u1: (r.x + r.width) / tw, v1 };
    }

    private _makeTextTex(text: string, fontSize: number, color: Color): Texture2D | null {
        try {
            // 2× 超采样：canvas 分辨率是显示尺寸的 2 倍，保证文字锐利
            const renderFs = fontSize * 2;
            const cw = Math.max(256, Math.ceil(renderFs * 5));
            const ch = Math.max(128, Math.ceil(renderFs * 2));
            const canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            this._paintText(canvas.getContext('2d')!, text, renderFs, color);

            const tex = new Texture2D();
            // reset + uploadData 是 Cocos Creator 3.x 最可靠的 canvas → GPU 路径
            tex.reset({ width: cw, height: ch, format: Texture2D.PixelFormat.RGBA8888, generateMipmaps: false });
            tex.uploadData(canvas);
            tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
            return tex;
        } catch (e) {
            console.warn('[PurchaseZoneView] 文字纹理创建失败', e);
            return null;
        }
    }

    private _paintText(ctx: CanvasRenderingContext2D, text: string, fontSize: number, color: Color): void {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const mx = ctx.canvas.width / 2;
        const my = ctx.canvas.height / 2;
        ctx.strokeStyle = 'rgba(30,30,30,1)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, mx, my);
        ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a / 255})`;
        ctx.fillText(text, mx, my);
    }
}
