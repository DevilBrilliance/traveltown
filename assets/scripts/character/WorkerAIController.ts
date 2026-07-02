import {
    _decorator,
    Component,
    Vec3,
} from 'cc';
import { BoundaryNavigator } from '../navigation/BoundaryNavigator';
import { PineappleFieldHelper } from '../fruit/PineappleFieldHelper';
import { FruitSource } from '../fruit/FruitSource';
import { JuiceMachine } from '../juice/JuiceMachine';
import { GameSceneRefs } from '../scene/GameSceneRefs';
import { PlayAreaBoundary } from '../scene/PlayAreaBoundary';
import { WorkerFruitCarrier } from './WorkerFruitCarrier';
import { WorkerMovementController } from './WorkerMovementController';

const { ccclass, property } = _decorator;

enum WorkerAIState {
    /** 收割前先回出生点 */
    GoToSpawnForHarvest,
    SeekPineapple,
    Harvest,
    /** 交付途中：先回工人出生点 */
    GoToSpawnForDeposit,
    /** 交付途中：再去榨汁机世界 UI */
    GoToDepositUI,
    Deposit,
    /** 机器满时在投料 UI 旁等待 */
    WaitAtDepositUI,
    /** 地里无菠萝：回出生点待机 */
    IdleAtSpawn,
}

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

    @property({ tooltip: '工人出生点（交付前先回到此点）' })
    spawnPosition = new Vec3();

    private _state = WorkerAIState.GoToSpawnForHarvest;
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
        if (this.spawnPosition.lengthSqr() < 1e-6) {
            this.spawnPosition.set(this.node.worldPosition);
        }
    }

    /** 设置工人出生点（RewardManager 生成时调用） */
    public setSpawnPosition(pos: Vec3): void {
        this.spawnPosition.set(pos);
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
            return;
        }

        switch (this._state) {
            case WorkerAIState.GoToSpawnForHarvest:
                this._updateGoToSpawnForHarvest(dt);
                break;
            case WorkerAIState.SeekPineapple:
                this._updateSeekPineapple(dt);
                break;
            case WorkerAIState.Harvest:
                this._updateHarvest();
                break;
            case WorkerAIState.GoToSpawnForDeposit:
                this._updateGoToSpawnForDeposit(dt);
                break;
            case WorkerAIState.GoToDepositUI:
                this._updateGoToDepositUI(dt);
                break;
            case WorkerAIState.Deposit:
                this._updateDeposit(dt);
                break;
            case WorkerAIState.WaitAtDepositUI:
                this._updateWaitAtDepositUI();
                break;
            case WorkerAIState.IdleAtSpawn:
                this._updateIdleAtSpawn(dt);
                break;
            default:
                break;
        }
    }

    private _updateSeekPineapple(dt: number): void {
        const carrier = this._carrier!;
        if (carrier.isFull) {
            this._clearTarget();
            this._setState(WorkerAIState.GoToSpawnForDeposit);
            return;
        }

        if (!PineappleFieldHelper.hasHarvestablePineappleFor(this.node)) {
            this._clearTarget();
            this._setState(this._shouldGoDeposit()
                ? WorkerAIState.GoToSpawnForDeposit
                : WorkerAIState.IdleAtSpawn);
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
            this._setState(this._shouldGoDeposit()
                ? WorkerAIState.GoToSpawnForDeposit
                : WorkerAIState.IdleAtSpawn);
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
            if (this._shouldGoDeposit()) {
                this._setState(WorkerAIState.GoToSpawnForDeposit);
            } else if (PineappleFieldHelper.hasHarvestablePineappleFor(this.node)) {
                this._setState(WorkerAIState.SeekPineapple);
            } else {
                this._setState(WorkerAIState.IdleAtSpawn);
            }
            return;
        }

        if (carrier.isFull) {
            this._clearTarget();
            this._setState(WorkerAIState.GoToSpawnForDeposit);
            return;
        }

        if (!carrier.isInHarvestRange(this._targetSource)) {
            this._setState(WorkerAIState.SeekPineapple);
        }
    }

    /** 有菠萝可收时：先回出生点，再进 SeekPineapple */
    private _updateGoToSpawnForHarvest(dt: number): void {
        const carrier = this._carrier!;
        if (carrier.isFull) {
            this._clearTarget();
            this._setState(WorkerAIState.GoToSpawnForDeposit);
            return;
        }

        if (!PineappleFieldHelper.hasHarvestablePineappleFor(this.node)) {
            this._clearTarget();
            this._setState(this._shouldGoDeposit()
                ? WorkerAIState.GoToSpawnForDeposit
                : WorkerAIState.IdleAtSpawn);
            return;
        }

        if (this._isAtSpawn()) {
            this._movement?.setMoving(false);
            this._setState(WorkerAIState.SeekPineapple);
            return;
        }

        this._navTarget.set(this.spawnPosition);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);

        if (move.arrived) {
            this._movement?.setMoving(false);
            this._setState(WorkerAIState.SeekPineapple);
        }
    }

    private _updateGoToSpawnForDeposit(dt: number): void {
        const carrier = this._carrier!;
        if (carrier.pineappleCount <= 0) {
            this._movement?.setMoving(false);
            this._setState(this._nextStateAfterEmptyBackpack());
            this._movement?.refreshAnim();
            return;
        }

        const machine = this.juiceMachine;
        if (!machine?.isActivated) {
            this._movement?.setMoving(false);
            return;
        }

        this._navTarget.set(this.spawnPosition);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);

        if (move.arrived) {
            this._movement?.setMoving(false);
            this._setState(WorkerAIState.GoToDepositUI);
        }
    }

    private _updateGoToDepositUI(dt: number): void {
        const carrier = this._carrier!;
        if (carrier.pineappleCount <= 0) {
            this._movement?.setMoving(false);
            this._setState(this._nextStateAfterEmptyBackpack());
            this._movement?.refreshAnim();
            return;
        }

        const machine = this.juiceMachine;
        if (!machine?.isActivated) {
            this._movement?.setMoving(false);
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

        if (!move.arrived) {
            return;
        }

        this._movement?.setMoving(false);
        if (machine.canDeposit && machine.isActorInDepositRange(this.node)) {
            this._setState(WorkerAIState.Deposit);
        } else if (!machine.canDeposit) {
            this._setState(WorkerAIState.WaitAtDepositUI);
        }
    }

    private _updateDeposit(dt: number): void {
        const carrier = this._carrier!;
        const machine = this.juiceMachine;
        if (!machine) {
            return;
        }

        if (carrier.pineappleCount <= 0) {
            this._movement?.setMoving(false);
            this._setState(this._nextStateAfterEmptyBackpack());
            this._movement?.refreshAnim();
            return;
        }

        if (!machine.isActorInDepositRange(this.node)) {
            this._setState(WorkerAIState.GoToDepositUI);
            return;
        }

        if (!machine.canDeposit) {
            this._setState(WorkerAIState.WaitAtDepositUI);
            return;
        }

        this._movement?.setMoving(false);
        machine.depositFromCarrier(carrier, dt);

        if (carrier.pineappleCount <= 0) {
            this._setState(this._nextStateAfterEmptyBackpack());
        } else if (!machine.canDeposit) {
            this._setState(WorkerAIState.WaitAtDepositUI);
        }
    }

    private _updateIdleAtSpawn(dt: number): void {
        const carrier = this._carrier!;

        if (this._shouldGoDeposit()) {
            this._setState(WorkerAIState.GoToSpawnForDeposit);
            return;
        }

        if (PineappleFieldHelper.hasHarvestablePineappleFor(this.node)) {
            this._setState(this._isAtSpawn()
                ? WorkerAIState.SeekPineapple
                : WorkerAIState.GoToSpawnForHarvest);
            return;
        }

        this._navTarget.set(this.spawnPosition);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);

        if (move.arrived) {
            this._movement?.setMoving(false);
        }
    }

    private _nextStateAfterEmptyBackpack(): WorkerAIState {
        return PineappleFieldHelper.hasHarvestablePineappleFor(this.node)
            ? WorkerAIState.GoToSpawnForHarvest
            : WorkerAIState.IdleAtSpawn;
    }

    private _shouldGoDeposit(): boolean {
        const carrier = this._carrier!;
        const machine = this.juiceMachine;
        if (!machine?.isActivated || carrier.pineappleCount <= 0) {
            return false;
        }
        if (carrier.isFull) {
            return true;
        }
        return !PineappleFieldHelper.hasHarvestablePineappleFor(this.node);
    }

    private _isAtSpawn(): boolean {
        const pos = this.node.worldPosition;
        const dx = pos.x - this.spawnPosition.x;
        const dz = pos.z - this.spawnPosition.z;
        return dx * dx + dz * dz <= this.arriveRadius * this.arriveRadius;
    }

    private _updateWaitAtDepositUI(): void {
        const carrier = this._carrier!;
        const machine = this.juiceMachine;
        if (!machine) {
            return;
        }

        if (carrier.pineappleCount <= 0) {
            this._movement?.setMoving(false);
            this._setState(this._nextStateAfterEmptyBackpack());
            this._movement?.refreshAnim();
            return;
        }

        this._movement?.setMoving(false);

        if (machine.canDeposit && machine.isActorInDepositRange(this.node)) {
            this._setState(WorkerAIState.Deposit);
            return;
        }

        if (machine.canDeposit) {
            this._setState(WorkerAIState.GoToDepositUI);
        }
    }

    private _clearTarget(): void {
        PineappleFieldHelper.releaseIfReserved(this._targetSource, this.node);
        this._targetSource = null;
        this._carrier?.setHarvestTarget(null);
    }

    private _setState(state: WorkerAIState): void {
        if (state === WorkerAIState.GoToSpawnForHarvest
            || state === WorkerAIState.GoToSpawnForDeposit
            || state === WorkerAIState.GoToDepositUI
            || state === WorkerAIState.WaitAtDepositUI
            || state === WorkerAIState.IdleAtSpawn) {
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
        this.boundary = GameSceneRefs.island?.getComponent(PlayAreaBoundary)
            ?? PlayAreaBoundary.instance;
    }

    private _resolveJuiceMachine(): void {
        if (this.juiceMachine?.isValid) {
            return;
        }
        this.juiceMachine = GameSceneRefs.juiceMachine;
    }
}
