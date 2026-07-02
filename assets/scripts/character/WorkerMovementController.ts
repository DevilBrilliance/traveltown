import {
    _decorator,
    Component,
} from 'cc';
import { CharacterAnimController } from './CharacterAnimController';
import { CharacterAnimState } from './CharacterAnimState';
import { WorkerFruitCarrier } from './WorkerFruitCarrier';

const { ccclass } = _decorator;

/** 工人移动表现：跑步动画（收割时不播） */
@ccclass('WorkerMovementController')
export class WorkerMovementController extends Component {
    private _anim: CharacterAnimController | null = null;
    private _carrier: WorkerFruitCarrier | null = null;
    private _isMoving = false;

    onLoad() {
        this._anim = this.getComponent(CharacterAnimController);
        this._carrier = this.getComponent(WorkerFruitCarrier);
        this.node.on('fruit-collect-anim-finished', this._onHarvestFinished, this);
    }

    onDestroy() {
        this.node?.off('fruit-collect-anim-finished', this._onHarvestFinished, this);
    }

    public setMoving(moving: boolean): void {
        if (moving === this._isMoving) {
            return;
        }
        this._isMoving = moving;
        this._playLocomotion(moving);
    }

    public refreshAnim(): void {
        if (this._carrier?.isHarvesting) {
            return;
        }
        this._playLocomotion(this._isMoving, true);
    }

    private _onHarvestFinished = (): void => {
        this._playLocomotion(this._isMoving, true);
    };

    private _playLocomotion(moving: boolean, force = false): void {
        if (this._carrier?.isHarvesting) {
            return;
        }
        const state = this._carrier?.getLocomotionAnimState(moving)
            ?? (moving ? CharacterAnimState.PlayerRun : CharacterAnimState.PlayerIdle);
        this._anim?.play(state, force);
    }
}
