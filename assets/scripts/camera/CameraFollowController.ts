import {
    _decorator,
    Component,
    director,
    Node,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

/** 场景 Main Camera 相对原点 (0,0,0) 的默认偏移 */
const DEFAULT_CAMERA_OFFSET = new Vec3(-14, 20, 14);

/**
 * 主相机跟随（固定俯视角 + 平滑偏移）
 * 市面常见做法：保持相机朝向不变，以固定世界空间偏移跟随目标，角色始终在画面中央。
 */
@ccclass('CameraFollowController')
export class CameraFollowController extends Component {
    @property({ type: Node, tooltip: '跟随目标（主角），不填则自动查找 Protagonist' })
    target: Node | null = null;

    @property({ tooltip: '相对目标的固定偏移（与场景 Main Camera 初始布局一致）' })
    positionOffset = DEFAULT_CAMERA_OFFSET.clone();

    @property({ tooltip: '跟随平滑系数，越大越快贴紧目标' })
    followSmooth = 12;

    @property({ tooltip: '绑定时是否立刻对齐到目标位置' })
    snapOnBind = true;

    private readonly _desired = new Vec3();

    lateUpdate(dt: number) {
        if (!this._ensureTarget()) {
            return;
        }
        this._applyFollow(dt, false);
    }

    /** 绑定跟随目标 */
    public setTarget(target: Node | null, snap = true): void {
        this.target = target;
        if (!target?.isValid) {
            return;
        }
        if (snap && this.snapOnBind) {
            this._applyFollow(0, true);
        }
    }

    private _ensureTarget(): boolean {
        if (this.target?.isValid) {
            return true;
        }
        const scene = director.getScene();
        this.target = scene?.getChildByName('Protagonist') ?? null;
        if (this.target?.isValid && this.snapOnBind) {
            this._applyFollow(0, true);
        }
        return this.target?.isValid ?? false;
    }

    private _computeDesiredPosition(out: Vec3): Vec3 {
        const targetPos = this.target!.worldPosition;
        out.set(
            targetPos.x + this.positionOffset.x,
            targetPos.y + this.positionOffset.y,
            targetPos.z + this.positionOffset.z,
        );
        return out;
    }

    private _applyFollow(dt: number, forceSnap: boolean): void {
        this._computeDesiredPosition(this._desired);

        const current = this.node.worldPosition;
        if (forceSnap || dt <= 0 || this.followSmooth <= 0) {
            this.node.setWorldPosition(this._desired);
            return;
        }

        const t = 1 - Math.exp(-this.followSmooth * dt);
        this.node.setWorldPosition(
            current.x + (this._desired.x - current.x) * t,
            current.y + (this._desired.y - current.y) * t,
            current.z + (this._desired.z - current.z) * t,
        );
    }

    /** 获取或创建 Main Camera 上的跟随组件 */
    public static bindMainCamera(target: Node, snap = true): CameraFollowController | null {
        const scene = director.getScene();
        const cameraNode = scene?.getChildByName('Main Camera');
        if (!cameraNode) {
            console.warn('[CameraFollowController] 未找到 Main Camera');
            return null;
        }
        const follow = cameraNode.getComponent(CameraFollowController)
            ?? cameraNode.addComponent(CameraFollowController);
        follow.setTarget(target, snap);
        return follow;
    }
}
