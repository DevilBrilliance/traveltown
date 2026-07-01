import {
    _decorator,
    Camera,
    Color,
    Component,
    director,
    Label,
    Layers,
    Node,
    RenderRoot2D,
    UIRenderer,
    Vec3,
} from 'cc';
import { PlayAreaBoundary } from '../scene/PlayAreaBoundary';

const { ccclass, property } = _decorator;

/**
 * 购买区世界 UI — 最简版本
 *
 * 渲染：RenderRoot2D（完全保留预制体样式）
 * 遮挡：每帧对摄像机→UI 中心做 ray-AABB 检测，
 *       中间有栅栏则整个 UI 隐藏，没有则显示。
 */
@ccclass('PurchaseZoneView')
export class PurchaseZoneView extends Component {
    @property({ tooltip: '余额不足时 UI 变暗' })
    dimWhenUnaffordable = true;

    private _uiRoot: Node | null = null;
    private _amountLabel: Label | null = null;
    private _affordable = true;
    private _camNode: Node | null = null;

    public setup(uiRoot: Node, uiScale: Vec3): void {
        // 贴地 & 缩放
        this.node.setRotationFromEuler(-90, 0, 0);
        this.node.setScale(uiScale);

        // 挂 RenderRoot2D（预制体根节点已有，加个保险）
        if (!this.node.getComponent(RenderRoot2D)) {
            this.node.addComponent(RenderRoot2D);
        }

        // 放入预制体
        uiRoot.setParent(this.node);
        uiRoot.setPosition(Vec3.ZERO);
        uiRoot.setScale(Vec3.ONE);
        uiRoot.setRotationFromEuler(0, 0, 0);
        this._uiRoot = uiRoot;

        // 设层，确保主相机可见
        this._setLayer(this.node, Layers.Enum.UI_3D);
        this._ensureCameraVisibility();

        // 缓存 Label
        const labels = uiRoot.getComponentsInChildren(Label);
        this._amountLabel = labels[labels.length - 1] ?? null;
    }

    public setAmount(amount: number): void {
        if (this._amountLabel) {
            this._amountLabel.string = `${amount}`;
        }
    }

    public setAffordable(affordable: boolean): void {
        if (this._affordable === affordable || !this.dimWhenUnaffordable) {
            return;
        }
        this._affordable = affordable;
        const alpha = affordable ? 255 : 140;
        for (const r of this.node.getComponentsInChildren(UIRenderer)) {
            const c = r.color;
            r.color = new Color(c.r, c.g, c.b, alpha);
        }
    }

    update(): void {
        if (!this._uiRoot?.isValid) {
            return;
        }
        this._uiRoot.active = !this._isOccluded();
    }

    // ─── private ────────────────────────────────────────────────────────────

    /** 摄像机→UI 中心是否被栅栏 AABB 遮挡 */
    private _isOccluded(): boolean {
        const boundary = PlayAreaBoundary.instance;
        if (!boundary) {
            return false;
        }

        const camPos = this._getCameraPos();
        const uiPos = this.node.worldPosition;

        // 摄像机到 UI 的方向向量和距离
        const dir = new Vec3();
        Vec3.subtract(dir, uiPos, camPos);
        const dist = dir.length();
        if (dist < 0.01) {
            return false;
        }
        Vec3.multiplyScalar(dir, dir, 1 / dist);

        // 遍历栅栏 AABB
        const aabbs = (boundary as any)._fenceAabbs as Array<{ center: Vec3; halfExtents: Vec3 }>;
        if (!aabbs?.length) {
            return false;
        }

        for (const box of aabbs) {
            if (this._rayAabb(camPos, dir, dist, box.center, box.halfExtents)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Slab 法 ray-AABB 相交检测
     * ray: origin + t*dir, t∈[0, maxDist]
     */
    private _rayAabb(
        origin: Vec3,
        dir: Vec3,
        maxDist: number,
        center: Vec3,
        half: Vec3,
    ): boolean {
        const INV = 1e9;
        let tmin = 0;
        let tmax = maxDist;

        const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
        for (const a of axes) {
            const invD = Math.abs(dir[a]) > 1e-8 ? 1 / dir[a] : INV;
            let t0 = ((center[a] - half[a]) - origin[a]) * invD;
            let t1 = ((center[a] + half[a]) - origin[a]) * invD;
            if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
            tmin = Math.max(tmin, t0);
            tmax = Math.min(tmax, t1);
            if (tmin > tmax) {
                return false;
            }
        }
        return tmin <= tmax;
    }

    private _getCameraPos(): Vec3 {
        if (!this._camNode?.isValid) {
            this._camNode = director.getScene()?.getChildByName('Main Camera') ?? null;
        }
        return this._camNode?.worldPosition ?? Vec3.ZERO;
    }

    private _setLayer(root: Node, layer: number): void {
        root.layer = layer;
        for (const child of root.children) {
            this._setLayer(child, layer);
        }
    }

    private _ensureCameraVisibility(): void {
        const scene = director.getScene();
        const cam = scene?.getChildByName('Main Camera')?.getComponent(Camera);
        if (cam && !(cam.visibility & Layers.Enum.UI_3D)) {
            cam.visibility |= Layers.Enum.UI_3D;
        }
    }
}
