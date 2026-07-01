import {
    _decorator,
    Component,
} from 'cc';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { CharacterAnimController } from './CharacterAnimController';
import { CharacterAnimState } from './CharacterAnimState';
import { WorkerFruitCarrier } from './WorkerFruitCarrier';

const { ccclass, property } = _decorator;

/** 工人移动表现：跑步动画 + 走路循环音效（收割时不播） */
@ccclass('WorkerMovementController')
export class WorkerMovementController extends Component {
    @property({ tooltip: '跑步音效相对音量' })
    runSoundVolume = 1;

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
            if (!this._carrier?.isHarvesting) {
                AudioController.ensure().playLoop(SoundEffect.Run, this.runSoundVolume);
            }
        } else {
            this._playLocomotion(false);
            AudioController.instance?.stopLoop();
        }
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
