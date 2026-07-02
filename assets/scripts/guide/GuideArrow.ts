import {
    _decorator,
    assetManager,
    Component,
    instantiate,
    Node,
    Prefab,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

/** JianTou.FBX 预制体 UUID */
export const GUIDE_ARROW_PREFAB_UUID = 'd2cdd0a2-5f5b-4def-993d-edfc2e2d1812@5c80c';

/**
 * 引导箭头：悬停在目标上方，使用模型默认朝向（指向地面）。
 */
@ccclass('GuideArrow')
export class GuideArrow extends Component {
    @property({ tooltip: '箭头模型缩放' })
    modelScale = 1;

    @property({ tooltip: '上下浮动幅度' })
    bobAmplitude = 0.25;

    @property({ tooltip: '上下浮动速度' })
    bobSpeed = 3;

    @property({ tooltip: '相对目标的世界坐标偏移' })
    worldOffset = new Vec3(0, 2, 0);

    private _target: Node | null = null;
    private _model: Node | null = null;
    private _loading = false;
    private _time = 0;

    private readonly _basePos = new Vec3();
    private readonly _worldPos = new Vec3();

    public setTarget(target: Node | null, offset?: Vec3): void {
        this._target = target?.isValid ? target : null;
        if (offset) {
            this.worldOffset.set(offset);
        }
        this.node.active = !!this._target;
        if (this._target) {
            this._ensureModel();
            this._syncPosition(0);
        }
    }

    public clearTarget(): void {
        this._target = null;
        this.node.active = false;
    }

    update(dt: number): void {
        if (!this._target?.isValid) {
            this.node.active = false;
            return;
        }
        this._time += dt;
        this._syncPosition(this._time);
    }

    private _syncPosition(time: number): void {
        const target = this._target!;
        target.getWorldPosition(this._worldPos);
        this._basePos.set(
            this._worldPos.x + this.worldOffset.x,
            this._worldPos.y + this.worldOffset.y + Math.sin(time * this.bobSpeed) * this.bobAmplitude,
            this._worldPos.z + this.worldOffset.z,
        );
        this.node.setWorldPosition(this._basePos);
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
