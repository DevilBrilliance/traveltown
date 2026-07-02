import {
    _decorator,
    Component,
} from 'cc';
import { PlayerJuiceTrayCarrier } from '../juice/PlayerJuiceTrayCarrier';
import { CharacterAnimController } from './CharacterAnimController';
import { CharacterAnimState } from './CharacterAnimState';

const { ccclass } = _decorator;

/** 服务员移动表现：端托盘跑步/待机 */
@ccclass('WaiterMovementController')
export class WaiterMovementController extends Component {
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
    }

    public setMoving(moving: boolean): void {
        if (moving === this._isMoving) {
            return;
        }
        this._isMoving = moving;
        this._playLocomotion(moving);
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
