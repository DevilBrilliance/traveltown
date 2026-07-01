import {
    _decorator,
    Camera,
    Component,
    director,
    math,
    Quat,
    Vec2,
    Vec3,
} from 'cc';
import { EasyTouchJoystick } from '../easytouch/EasyTouchJoystick';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { CharacterAnimController } from './CharacterAnimController';
import { CharacterAnimState } from './CharacterAnimState';
import { PlayerFruitCarrier } from '../fruit/PlayerFruitCarrier';
import { PlayerJuiceTrayCarrier } from '../juice/PlayerJuiceTrayCarrier';
import { PlayAreaBoundary } from '../scene/PlayAreaBoundary';

const { ccclass, property } = _decorator;

/**
 * 玩家移动：读取 EasyTouch 摇杆，在地面 XZ 平面移动并转向，同步跑步/待机动画。
 */
@ccclass('PlayerMovementController')
export class PlayerMovementController extends Component {
    @property({ tooltip: '最大移动速度（单位/秒）' })
    maxSpeed = 10;

    @property({ type: EasyTouchJoystick, tooltip: '不填则自动查找场景中的摇杆' })
    joystick: EasyTouchJoystick | null = null;

    @property({ type: Camera, tooltip: '不填则使用 Main Camera，将摇杆方向映射到地面' })
    referenceCamera: Camera | null = null;

    @property({ tooltip: '转身速度（度/秒），0 表示瞬间转向' })
    rotateSpeed = 0;

    @property({ tooltip: '跑步时播放跑步循环音效' })
    runSoundEnabled = true;

    @property({ tooltip: '跑步音效相对音量' })
    runSoundVolume = 1;

    @property({ type: PlayAreaBoundary, tooltip: '栅栏碰撞，不填则自动查找' })
    boundary: PlayAreaBoundary | null = null;

    @property({ type: PlayerFruitCarrier, tooltip: '背篓，不填则自动查找同节点组件' })
    fruitCarrier: PlayerFruitCarrier | null = null;

    @property({ type: PlayerJuiceTrayCarrier, tooltip: '端托盘，不填则自动查找同节点组件' })
    juiceTrayCarrier: PlayerJuiceTrayCarrier | null = null;

    private _anim: CharacterAnimController | null = null;
    private _isMoving = false;

    private readonly _worldDir = new Vec3();
    private readonly _nextPos = new Vec3();
    private readonly _forward = new Vec3();
    private readonly _right = new Vec3();
    private readonly _worldEuler = new Vec3();
    private readonly _targetQuat = new Quat();

    onLoad() {
        this._anim = this.getComponent(CharacterAnimController);
        if (!this.fruitCarrier) {
            this.fruitCarrier = this.getComponent(PlayerFruitCarrier);
        }
    }

    start() {
        this._resolveJoystick();
        this._resolveCamera();
        this._resolveBoundary();
        if (!this.fruitCarrier) {
            this.fruitCarrier = this.getComponent(PlayerFruitCarrier);
        }
        if (!this.juiceTrayCarrier) {
            this.juiceTrayCarrier = this.getComponent(PlayerJuiceTrayCarrier);
        }
        this.node.on('fruit-collect-anim-finished', this._refreshLocomotionAnim, this);
        this.node.on('fruit-harvest-started', this._refreshLocomotionAnim, this);
        this.node.on('fruit-harvest-started', this._onHarvestStarted, this);
        this.node.on('fruit-collect-anim-finished', this._onHarvestFinished, this);
        this.node.on('fruit-carry-changed', this._refreshLocomotionAnim, this);
        this.node.on('juice-tray-changed', this._refreshLocomotionAnim, this);
    }

    onDestroy() {
        if (!this.node?.isValid) {
            return;
        }
        this.node.off('fruit-collect-anim-finished', this._refreshLocomotionAnim, this);
        this.node.off('fruit-harvest-started', this._refreshLocomotionAnim, this);
        this.node.off('fruit-harvest-started', this._onHarvestStarted, this);
        this.node.off('fruit-collect-anim-finished', this._onHarvestFinished, this);
        this.node.off('fruit-carry-changed', this._refreshLocomotionAnim, this);
        this.node.off('juice-tray-changed', this._refreshLocomotionAnim, this);
        if (this._isMoving && this.runSoundEnabled) {
            AudioController.instance?.stopLoop();
        }
    }

    update(dt: number) {
        const joystick = this.joystick;
        if (!joystick || joystick.magnitude <= 0) {
            this._setMoving(false);
            return;
        }

        this._joystickToWorldDirection(joystick.direction, this._worldDir);
        if (this._worldDir.lengthSqr() < 1e-6) {
            this._setMoving(false);
            return;
        }

        const speed = this.maxSpeed * joystick.magnitude;
        const pos = this.node.worldPosition;
        this._nextPos.set(
            pos.x + this._worldDir.x * speed * dt,
            pos.y,
            pos.z + this._worldDir.z * speed * dt,
        );
        this.boundary?.clampWorldPosition(this._nextPos);
        this.node.setWorldPosition(this._nextPos);

        this._updateRotation(dt);
        this._setMoving(true);
        if (this.fruitCarrier?.isHarvesting && this.runSoundEnabled) {
            AudioController.instance?.stopLoop();
        }
    }

    private _setMoving(moving: boolean): void {
        if (moving === this._isMoving) {
            return;
        }
        this._isMoving = moving;
        if (moving) {
            this._playLocomotionAnim(true);
            if (this._canPlayRunSound()) {
                AudioController.ensure().playLoop(SoundEffect.Run, this.runSoundVolume);
            } else if (this.fruitCarrier?.isHarvesting) {
                AudioController.instance?.stopLoop();
            }
        } else {
            this._playLocomotionAnim(false);
            if (this.runSoundEnabled) {
                AudioController.instance?.stopLoop();
            }
        }
    }

    private _canPlayRunSound(): boolean {
        return this.runSoundEnabled && !this.fruitCarrier?.isHarvesting;
    }

    private _onHarvestStarted = (): void => {
        AudioController.instance?.stopLoop();
    };

    private _onHarvestFinished = (): void => {
        if (this._isMoving && this._canPlayRunSound()) {
            AudioController.ensure().playLoop(SoundEffect.Run, this.runSoundVolume);
        }
    };

    private _refreshLocomotionAnim = (): void => {
        this._playLocomotionAnim(this._isMoving, true);
    };

    private _playLocomotionAnim(moving: boolean, force = false): void {
        const carrierState = this.fruitCarrier?.getLocomotionAnimState(moving);
        const trayState = this.juiceTrayCarrier?.getLocomotionAnimState(moving);
        const state = carrierState ?? trayState ?? (moving ? CharacterAnimState.PlayerRun : CharacterAnimState.PlayerIdle);
        this._anim?.play(state, force);
    }

    private _updateRotation(dt: number): void {
        const targetY = math.toDegree(Math.atan2(this._worldDir.x, this._worldDir.z));

        if (this.rotateSpeed <= 0) {
            Quat.fromEuler(this._targetQuat, 0, targetY, 0);
            this.node.setWorldRotation(this._targetQuat);
            return;
        }

        Quat.copy(this._targetQuat, this.node.worldRotation);
        this._targetQuat.getEulerAngles(this._worldEuler);
        let currentY = this._worldEuler.y;

        let delta = targetY - currentY;
        while (delta > 180) {
            delta -= 360;
        }
        while (delta < -180) {
            delta += 360;
        }

        const step = this.rotateSpeed * dt;
        const newY = Math.abs(delta) <= step ? targetY : currentY + Math.sign(delta) * step;
        Quat.fromEuler(this._targetQuat, 0, newY, 0);
        this.node.setWorldRotation(this._targetQuat);
    }

    private _joystickToWorldDirection(input: Vec2, out: Vec3): void {
        const camera = this.referenceCamera;
        if (!camera) {
            out.set(input.x, 0, input.y);
            if (out.lengthSqr() > 1e-6) {
                out.normalize();
            }
            return;
        }

        this._forward.set(camera.node.forward);
        this._forward.y = 0;
        if (this._forward.lengthSqr() > 1e-6) {
            this._forward.normalize();
        } else {
            this._forward.set(0, 0, -1);
        }

        this._right.set(camera.node.right);
        this._right.y = 0;
        if (this._right.lengthSqr() > 1e-6) {
            this._right.normalize();
        } else {
            this._right.set(1, 0, 0);
        }

        out.set(
            this._right.x * input.x + this._forward.x * input.y,
            0,
            this._right.z * input.x + this._forward.z * input.y,
        );
        if (out.lengthSqr() > 1e-6) {
            out.normalize();
        }
    }

    private _resolveJoystick(): void {
        if (this.joystick) {
            return;
        }
        const scene = director.getScene();
        this.joystick = scene?.getComponentInChildren(EasyTouchJoystick) ?? null;
        if (!this.joystick) {
            console.warn('[PlayerMovementController] 未找到 EasyTouchJoystick');
        }
    }

    private _resolveCamera(): void {
        if (this.referenceCamera) {
            return;
        }
        const scene = director.getScene();
        const cameraNode = scene?.getChildByName('Main Camera');
        this.referenceCamera = cameraNode?.getComponent(Camera) ?? null;
    }

    private _resolveBoundary(): void {
        if (this.boundary) {
            return;
        }
        this.boundary = PlayAreaBoundary.instance
            ?? director.getScene()?.getComponentInChildren(PlayAreaBoundary)
            ?? null;
    }
}
