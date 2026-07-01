import {
    _decorator,
    Component,
} from 'cc';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { PlayerJuiceTrayCarrier } from '../juice/PlayerJuiceTrayCarrier';
import { CharacterAnimController } from './CharacterAnimController';
import { CharacterAnimState } from './CharacterAnimState';

const { ccclass, property } = _decorator;

/** 服务员移动表现：端托盘跑步/待机 + 走路循环音效 */
@ccclass('WaiterMovementController')
export class WaiterMovementController extends Component {
    @property({ tooltip: '跑步音效相对音量' })
    runSoundVolume = 1;

    private _anim: CharacterAnimController | null = null;
    private _tray: PlayerJuiceTrayCarrier | null = null;
    private _isMoving = false;

    onLoad() {
        this._anim = this.getComponent(CharacterAnimController);
        this._tray = this.getComponent(PlayerJuiceTrayCarrier);
        this.node.on('juice-tray-changed', this._refreshAnim, this);
    }

    onDestroy() {
        this.node?.off('juice-tray-changed', this._refreshAnim, this);
        if (this._isMoving) {
            AudioController.instance?.stopLoop();
        }
    }

    public setMoving(moving: boolean): void {
        if (moving === this._isMoving) {
            return;
        }
        this._isMoving = moving;
        if (moving) {
            this._playLocomotion(true);
            AudioController.ensure().playLoop(SoundEffect.Run, this.runSoundVolume);
        } else {
            this._playLocomotion(false);
            AudioController.instance?.stopLoop();
        }
    }

    public refreshAnim(): void {
        this._playLocomotion(this._isMoving, true);
    }

    private _refreshAnim = (): void => {
        this._playLocomotion(this._isMoving, true);
    };

    private _playLocomotion(moving: boolean, force = false): void {
        const state = this._tray?.getLocomotionAnimState(moving)
            ?? (moving ? CharacterAnimState.PlayerRun : CharacterAnimState.PlayerIdle);
        this._anim?.play(state, force);
    }
}
