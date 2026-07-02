import {
    _decorator,
    assetManager,
    Component,
    instantiate,
    Node,
    Prefab,
    Quat,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

/** JianTou.FBX 预制体 UUID */
export const GUIDE_ARROW_PREFAB_UUID = 'd2cdd0a2-5f5b-4def-993d-edfc2e2d1812@5c80c';

enum GuideArrowMode {
    None,
    Node,
    World,
    FixedPose,
}

/**
 * 引导箭头：悬停在目标上方，上下浮动，默认朝向指向地面。
 */
@ccclass('GuideArrow')
export class GuideArrow extends Component {
    @property({ tooltip: '箭头模型缩放' })
    modelScale = 1;

    @property({ tooltip: '上下浮动幅度' })
    bobAmplitude = 0.8;

    @property({ tooltip: '上下浮动速度' })
    bobSpeed = 4;

    @property({ tooltip: '相对目标的世界坐标偏移' })
    worldOffset = new Vec3(0, 2, 0);

    private _mode = GuideArrowMode.None;
    private _target: Node | null = null;
    private _model: Node | null = null;
    private _loading = false;
    private _time = 0;

    private readonly _basePos = new Vec3();
    private readonly _worldPos = new Vec3();
    private readonly _worldTarget = new Vec3();
    private readonly _fixedPos = new Vec3();
    private readonly _fixedEuler = new Vec3();
    private readonly _worldRot = new Quat();

    public setTarget(target: Node | null, offset?: Vec3): void {
        this._mode = target?.isValid ? GuideArrowMode.Node : GuideArrowMode.None;
        this._target = target?.isValid ? target : null;
        if (offset) {
            this.worldOffset.set(offset);
        }
        this.node.active = !!this._target;
        if (this._target) {
            this._ensureModel();
            this._syncTransform(0);
        }
    }

    /** 指向固定世界坐标（目标点 + 偏移） */
    public setWorldTarget(worldPos: Vec3 | null, offset?: Vec3): void {
        if (!worldPos) {
            this.clearTarget();
            return;
        }
        this._mode = GuideArrowMode.World;
        this._target = null;
        this._worldTarget.set(worldPos);
        if (offset) {
            this.worldOffset.set(offset);
        }
        this.node.active = true;
        this._ensureModel();
        this._syncTransform(0);
    }

    /** 固定世界坐标与旋转（菠萝引导等） */
    public setFixedPose(worldPos: Vec3, euler: Vec3): void {
        this._mode = GuideArrowMode.FixedPose;
        this._target = null;
        this._fixedPos.set(worldPos);
        this._fixedEuler.set(euler);
        this.node.active = true;
        this._ensureModel();
        this._syncTransform(0);
    }

    public clearTarget(): void {
        this._mode = GuideArrowMode.None;
        this._target = null;
        this.node.active = false;
    }

    update(dt: number): void {
        if (this._mode === GuideArrowMode.None) {
            this.node.active = false;
            return;
        }
        if (this._mode === GuideArrowMode.Node && !this._target?.isValid) {
            this.node.active = false;
            return;
        }
        this._time += dt;
        this._syncTransform(this._time);
    }

    private _syncTransform(time: number): void {
        const bobY = Math.sin(time * this.bobSpeed) * this.bobAmplitude;

        switch (this._mode) {
            case GuideArrowMode.FixedPose:
                this._basePos.set(this._fixedPos.x, this._fixedPos.y + bobY, this._fixedPos.z);
                this.node.setWorldPosition(this._basePos);
                Quat.fromEuler(this._worldRot, this._fixedEuler.x, this._fixedEuler.y, this._fixedEuler.z);
                this.node.setWorldRotation(this._worldRot);
                return;
            case GuideArrowMode.World:
                this._worldPos.set(this._worldTarget);
                break;
            case GuideArrowMode.Node:
                if (!this._target?.isValid) {
                    this.node.active = false;
                    return;
                }
                this._target.getWorldPosition(this._worldPos);
                break;
            default:
                this.node.active = false;
                return;
        }

        this._basePos.set(
            this._worldPos.x + this.worldOffset.x,
            this._worldPos.y + this.worldOffset.y + bobY,
            this._worldPos.z + this.worldOffset.z,
        );
        this.node.setWorldPosition(this._basePos);
        Quat.fromEuler(this._worldRot, 0, 0, 0);
        this.node.setWorldRotation(this._worldRot);
    }

    private _ensureModel(): void {
        if (this._model?.isValid) {
            return;
        }
        if (this._loading) {
            return;
        }
        this._loading = true;
        assetManager.loadAny({ uuid: GUIDE_ARROW_PREFAB_UUID, type: Prefab }, (err, asset) => {
            this._loading = false;
            if (err || !asset || !this.isValid) {
                console.warn('[GuideArrow] JianTou 加载失败', err);
                return;
            }
            const prefab = asset as Prefab;
            const model = instantiate(prefab);
            model.setParent(this.node);
            model.setPosition(Vec3.ZERO);
            model.setRotationFromEuler(0, 0, 0);
            const s = this.modelScale;
            model.setScale(s, s, s);
            this._model = model;
        });
    }
}
