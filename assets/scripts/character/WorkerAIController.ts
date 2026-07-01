import {
    _decorator,
    Component,
    director,
    Vec3,
} from 'cc';
import { BoundaryNavigator } from '../navigation/BoundaryNavigator';
import { PineappleFieldHelper } from '../fruit/PineappleFieldHelper';
import { FruitSource } from '../fruit/FruitSource';
import { JuiceMachine } from '../juice/JuiceMachine';
import { PlayAreaBoundary } from '../scene/PlayAreaBoundary';
import { WorkerFruitCarrier } from './WorkerFruitCarrier';
import { WorkerMovementController } from './WorkerMovementController';

const { ccclass, property } = _decorator;

enum WorkerAIState {
    SeekPineapple,
    Harvest,
    GoToMachine,
    Deposit,
    WaitAtMachine,
}

/** 机器满时在投料区旁等待的世界坐标 */
const MACHINE_WAIT_POSITION = new Vec3(24, 0, -8);

/**
 * 工人 AI：寻路收割菠萝 → 投榨汁机 → 机器满时等待。
 */
@ccclass('WorkerAIController')
export class WorkerAIController extends Component {
    @property({ tooltip: '移动速度（单位/秒）' })
    moveSpeed = 4.5;

    @property({ tooltip: '到达目标判定半径' })
    arriveRadius = 0.7;

    @property({ type: PlayAreaBoundary, tooltip: '栅栏碰撞，不填则自动查找' })
    boundary: PlayAreaBoundary | null = null;

    @property({ type: JuiceMachine, tooltip: '榨汁机，不填则自动查找' })
    juiceMachine: JuiceMachine | null = null;

    private _state = WorkerAIState.SeekPineapple;
    private _carrier: WorkerFruitCarrier | null = null;
    private _movement: WorkerMovementController | null = null;
    private _targetSource: FruitSource | null = null;

    private readonly _navTarget = new Vec3();

    onLoad() {
        this._carrier = this.getComponent(WorkerFruitCarrier);
        this._movement = this.getComponent(WorkerMovementController);
    }

    start() {
        this._resolveBoundary();
        this._resolveJuiceMachine();
    }

    onDestroy() {
        PineappleFieldHelper.releaseIfReserved(this._targetSource, this.node);
        this._targetSource = null;
    }

    update(dt: number) {
        if (!this._carrier) {
            return;
        }
        this._resolveJuiceMachine();

        if (this._carrier.isHarvesting) {
            this._movement?.setMoving(false);
            this._movement?.refreshAnim();
            return;
        }

        switch (this._state) {
            case WorkerAIState.SeekPineapple:
                this._updateSeekPineapple(dt);
                break;
            case WorkerAIState.Harvest:
                this._updateHarvest();
                break;
            case WorkerAIState.GoToMachine:
                this._updateGoToMachine(dt);
                break;
            case WorkerAIState.Deposit:
                this._updateDeposit(dt);
                break;
            case WorkerAIState.WaitAtMachine:
                this._updateWaitAtMachine(dt);
                break;
            default:
                break;
        }
    }

    private _updateSeekPineapple(dt: number): void {
        const carrier = this._carrier!;
        if (carrier.isFull || !PineappleFieldHelper.hasAvailablePineapple()) {
            this._clearTarget();
            this._setState(WorkerAIState.GoToMachine);
            return;
        }

        if (!this._targetSource?.isAvailable || this._targetSource.isReservedByOther(this.node)) {
            this._clearTarget();
            this._targetSource = PineappleFieldHelper.findNearestPineapple(
                this.node,
                this.node.worldPosition,
                true,
            );
            carrier.setHarvestTarget(this._targetSource);
        }

        if (!this._targetSource) {
            this._movement?.setMoving(false);
            this._setState(WorkerAIState.GoToMachine);
            return;
        }

        this._targetSource.getCollectWorldPosition(this._navTarget);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);

        if (move.arrived || carrier.isInHarvestRange(this._targetSource)) {
            this._movement?.setMoving(false);
            this._setState(WorkerAIState.Harvest);
        }
    }

    private _updateHarvest(): void {
        const carrier = this._carrier!;
        if (carrier.isHarvesting) {
            return;
        }

        if (carrier.tryStartHarvest(this._targetSource)) {
            return;
        }

        if (carrier.isOnCollectCooldown && this._targetSource?.isAvailable) {
            return;
        }

        if (!this._targetSource?.isAvailable) {
            this._clearTarget();
            if (carrier.isFull || !PineappleFieldHelper.hasAvailablePineapple()) {
                this._setState(WorkerAIState.GoToMachine);
            } else {
                this._setState(WorkerAIState.SeekPineapple);
            }
            return;
        }

        if (carrier.isFull) {
            this._clearTarget();
            this._setState(WorkerAIState.GoToMachine);
            return;
        }

        if (!carrier.isInHarvestRange(this._targetSource)) {
            this._setState(WorkerAIState.SeekPineapple);
        }
    }

    private _updateGoToMachine(dt: number): void {
        const carrier = this._carrier!;
        if (carrier.pineappleCount <= 0) {
            this._movement?.setMoving(false);
            this._setState(WorkerAIState.SeekPineapple);
            return;
        }

        const machine = this.juiceMachine;
        if (!machine?.isActivated) {
            this._movement?.setMoving(false);
            return;
        }

        if (machine.isActorInDepositRange(this.node)) {
            this._movement?.setMoving(false);
            this._setState(machine.canDeposit ? WorkerAIState.Deposit : WorkerAIState.WaitAtMachine);
            return;
        }

        machine.getDepositWorldPosition(this._navTarget);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);
    }

    private _updateDeposit(dt: number): void {
        const carrier = this._carrier!;
        const machine = this.juiceMachine;
        if (!machine) {
            return;
        }

        if (carrier.pineappleCount <= 0) {
            this._movement?.setMoving(false);
            this._setState(WorkerAIState.SeekPineapple);
            return;
        }

        if (!machine.isActorInDepositRange(this.node)) {
            this._setState(WorkerAIState.GoToMachine);
            return;
        }

        if (!machine.canDeposit) {
            this._setState(WorkerAIState.WaitAtMachine);
            return;
        }

        this._movement?.setMoving(false);
        machine.depositFromCarrier(carrier, dt);

        if (carrier.pineappleCount <= 0) {
            this._setState(WorkerAIState.SeekPineapple);
        } else if (!machine.canDeposit) {
            this._setState(WorkerAIState.WaitAtMachine);
        }
    }

    private _updateWaitAtMachine(dt: number): void {
        const carrier = this._carrier!;
        const machine = this.juiceMachine;
        if (!machine) {
            return;
        }

        if (carrier.pineappleCount <= 0) {
            this._movement?.setMoving(false);
            this._setState(WorkerAIState.SeekPineapple);
            return;
        }

        if (machine.canDeposit && machine.isActorInDepositRange(this.node)) {
            this._setState(WorkerAIState.Deposit);
            return;
        }

        this._navTarget.set(MACHINE_WAIT_POSITION);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed * 0.6,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);

        if (move.arrived && machine.canDeposit) {
            this._setState(WorkerAIState.GoToMachine);
        }
    }

    private _clearTarget(): void {
        PineappleFieldHelper.releaseIfReserved(this._targetSource, this.node);
        this._targetSource = null;
        this._carrier?.setHarvestTarget(null);
    }

    private _setState(state: WorkerAIState): void {
        if (state === WorkerAIState.GoToMachine || state === WorkerAIState.WaitAtMachine) {
            if (this._state === WorkerAIState.SeekPineapple || this._state === WorkerAIState.Harvest) {
                this._clearTarget();
            }
        }
        this._state = state;
    }

    private _resolveBoundary(): void {
        if (this.boundary?.isValid) {
            return;
        }
        const island = director.getScene()?.getChildByName('Island');
        this.boundary = island?.getComponent(PlayAreaBoundary)
            ?? PlayAreaBoundary.instance;
    }

    private _resolveJuiceMachine(): void {
        if (this.juiceMachine?.isValid) {
            return;
        }
        const island = director.getScene()?.getChildByName('Island');
        const zone = island?.getChildByName('JuiceMachineZone');
        this.juiceMachine = zone?.getComponent(JuiceMachine) ?? null;
    }
}
