import {
    _decorator,
    Component,
    director,
    math,
    Node,
    Vec3,
} from 'cc';
import { CameraFollowController } from './CameraFollowController';

const { ccclass, property } = _decorator;

/** 场景默认相机相对目标的球坐标（由 Main Camera 初始布局反算） */
const DEFAULT_YAW = -45;
const DEFAULT_PITCH = 45;
const DEFAULT_DISTANCE = 28.14;

/**
 * 轨道相机：围绕目标旋转观察 + 缩放远近，平滑跟随目标移动。
 */
@ccclass('CameraOrbitController')
export class CameraOrbitController extends Component {
    @property({ type: Node, tooltip: '观察目标（主角），不填则自动查找 Protagonist' })
    target: Node | null = null;

    @property({ tooltip: '注视点相对目标的高度偏移' })
    focusHeight = 1.2;

    @property({ tooltip: '水平旋转角（度）' })
    yaw = DEFAULT_YAW;

    @property({ tooltip: '俯仰角（度）' })
    pitch = DEFAULT_PITCH;

    @property({ tooltip: '相机与注视点的距离' })
    distance = DEFAULT_DISTANCE;

    @property({ tooltip: '最小俯仰角' })
    minPitch = 18;

    @property({ tooltip: '最大俯仰角' })
    maxPitch = 72;

    @property({ tooltip: '最近距离' })
    minDistance = 14;

    @property({ tooltip: '最远距离' })
    maxDistance = 42;

    @property({ tooltip: '目标移动时注视点平滑系数' })
    followSmooth = 12;

    @property({ tooltip: '缩放平滑速度（距离单位/秒），越大越快贴近目标' })
    zoomSmoothSpeed = 28;

    @property({ tooltip: '绑定时是否立刻对齐' })
    snapOnBind = true;

    private _pivot = new Vec3();
    private _currentPivot = new Vec3();
    private _cameraPos = new Vec3();
    private _displayDistance = DEFAULT_DISTANCE;
    private _pivotReady = false;

    onLoad() {
        this._displayDistance = this.distance;
    }

    lateUpdate(dt: number) {
        if (!this._ensureTarget()) {
            return;
        }
        this._applyOrbit(dt, false);
    }

    public get currentDistance(): number {
        return this.distance;
    }

    /** 绑定目标，并从当前相机姿态采样 yaw/pitch/distance */
    public setTarget(target: Node | null, snap = true): void {
        this.target = target;
        if (!target?.isValid) {
            return;
        }
        this._captureOrbitFromCamera();
        this._pivotReady = false;
        if (snap && this.snapOnBind) {
            this._applyOrbit(0, true);
        }
    }

    /** 增加水平旋转（度） */
    public addYawDelta(degrees: number): void {
        this.yaw += degrees;
    }

    /** 增加俯仰（度） */
    public addPitchDelta(degrees: number): void {
        this.pitch = math.clamp(this.pitch + degrees, this.minPitch, this.maxPitch);
    }

    /** 增加缩放距离（目标距离，实际距离平滑过渡） */
    public addDistanceDelta(delta: number): void {
        this.distance = math.clamp(this.distance + delta, this.minDistance, this.maxDistance);
    }

    /** 滚轮缩放：按比例改变目标距离，实际距离在 lateUpdate 中平滑过渡 */
    public applyWheelZoom(scrollY: number, sensitivity = 0.08): void {
        const scroll = math.clamp(scrollY, -2, 2);
        const factor = 1 - scroll * sensitivity;
        this.distance = math.clamp(this.distance * factor, this.minDistance, this.maxDistance);
    }

    /** 直接设置距离 */
    public setDistance(value: number, snap = false): void {
        this.distance = math.clamp(value, this.minDistance, this.maxDistance);
        if (snap) {
            this._displayDistance = this.distance;
        }
    }

    private _ensureTarget(): boolean {
        if (this.target?.isValid) {
            return true;
        }
        const scene = director.getScene();
        this.target = scene?.getChildByName('Protagonist') ?? null;
        if (this.target?.isValid && !this._pivotReady) {
            this._captureOrbitFromCamera();
            if (this.snapOnBind) {
                this._applyOrbit(0, true);
            }
        }
        return this.target?.isValid ?? false;
    }

    private _getTargetPivot(out: Vec3): Vec3 {
        const pos = this.target!.worldPosition;
        out.set(pos.x, pos.y + this.focusHeight, pos.z);
        return out;
    }

    private _captureOrbitFromCamera(): void {
        if (!this.target?.isValid) {
            return;
        }
        this._getTargetPivot(this._pivot);
        const camPos = this.node.worldPosition;
        const dx = camPos.x - this._pivot.x;
        const dy = camPos.y - this._pivot.y;
        const dz = camPos.z - this._pivot.z;

        this.distance = Math.max(Math.hypot(dx, dy, dz), this.minDistance);
        this._displayDistance = this.distance;
        this.yaw = math.toDegree(Math.atan2(dx, dz));
        const horiz = Math.hypot(dx, dz);
        this.pitch = math.clamp(
            math.toDegree(Math.atan2(dy, horiz)),
            this.minPitch,
            this.maxPitch,
        );
    }

    private _applyOrbit(dt: number, forceSnap: boolean): void {
        this._getTargetPivot(this._pivot);

        if (!this._pivotReady || forceSnap || dt <= 0 || this.followSmooth <= 0) {
            this._currentPivot.set(this._pivot);
            this._pivotReady = true;
        } else {
            const t = 1 - Math.exp(-this.followSmooth * dt);
            this._currentPivot.set(
                this._currentPivot.x + (this._pivot.x - this._currentPivot.x) * t,
                this._currentPivot.y + (this._pivot.y - this._currentPivot.y) * t,
                this._currentPivot.z + (this._pivot.z - this._currentPivot.z) * t,
            );
        }

        if (forceSnap || dt <= 0) {
            this._displayDistance = this.distance;
        } else {
            const diff = this.distance - this._displayDistance;
            const step = this.zoomSmoothSpeed * dt;
            if (Math.abs(diff) <= step) {
                this._displayDistance = this.distance;
            } else {
                this._displayDistance += Math.sign(diff) * step;
            }
        }

        const yawRad = math.toRadian(this.yaw);
        const pitchRad = math.toRadian(this.pitch);
        const cosPitch = Math.cos(pitchRad);

        this._cameraPos.set(
            this._currentPivot.x + this._displayDistance * cosPitch * Math.sin(yawRad),
            this._currentPivot.y + this._displayDistance * Math.sin(pitchRad),
            this._currentPivot.z + this._displayDistance * cosPitch * Math.cos(yawRad),
        );

        this.node.setWorldPosition(this._cameraPos);
        this.node.lookAt(this._currentPivot);
    }

    /** 绑定 Main Camera 并移除旧的固定偏移跟随 */
    public static bindMainCamera(target: Node, snap = true): CameraOrbitController | null {
        const scene = director.getScene();
        const cameraNode = scene?.getChildByName('Main Camera');
        if (!cameraNode) {
            console.warn('[CameraOrbitController] 未找到 Main Camera');
            return null;
        }

        const legacyFollow = cameraNode.getComponent(CameraFollowController);
        if (legacyFollow) {
            legacyFollow.destroy();
        }

        const orbit = cameraNode.getComponent(CameraOrbitController)
            ?? cameraNode.addComponent(CameraOrbitController);
        orbit.setTarget(target, snap);
        return orbit;
    }
}
