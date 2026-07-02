import {
    _decorator,
    Component,
    Node,
    Vec3,
} from 'cc';
import { hasPendingCustomerJuiceOrder } from '../order/CustomerOrderHelper';
import { BoundaryNavigator } from '../navigation/BoundaryNavigator';
import { PlayerJuiceTrayCarrier } from '../juice/PlayerJuiceTrayCarrier';
import { JuiceMachine } from '../juice/JuiceMachine';
import { resolveNearestCounterDelivery } from '../juice/CounterDeliveryHelper';
import { GameSceneRefs } from '../scene/GameSceneRefs';
import { PlayAreaBoundary } from '../scene/PlayAreaBoundary';
import { WaiterMovementController } from './WaiterMovementController';

const { ccclass, property } = _decorator;

enum WaiterAIState {
    IdleAtSpawn,
    GoToRack,
    GoToCounter,
}

/**
 * 服务员 AI：取场景果汁 → 收银台交付给顾客；无果汁或无订单时在出生点待机。
 */
@ccclass('WaiterAIController')
export class WaiterAIController extends Component {
    @property({ tooltip: '移动速度（单位/秒）' })
    moveSpeed = 4.5;

    @property({ tooltip: '到达目标判定半径' })
    arriveRadius = 0.7;

    @property({ type: PlayAreaBoundary, tooltip: '栅栏碰撞，不填则自动查找' })
    boundary: PlayAreaBoundary | null = null;

    @property({ type: JuiceMachine, tooltip: '榨汁机，不填则自动查找' })
    juiceMachine: JuiceMachine | null = null;

    @property({ tooltip: '服务员出生点' })
    spawnPosition = new Vec3();

    private _state = WaiterAIState.IdleAtSpawn;
    private _tray: PlayerJuiceTrayCarrier | null = null;
    private _movement: WaiterMovementController | null = null;
    private _counterNode: Node | null = null;

    private readonly _navTarget = new Vec3();

    onLoad() {
        this._tray = this.getComponent(PlayerJuiceTrayCarrier);
        this._movement = this.getComponent(WaiterMovementController);
    }

    start() {
        this._resolveBoundary();
        this._resolveJuiceMachine();
        this._tray?.bindFromSceneRefs();
        this._tray?.bindJuiceMachine(this.juiceMachine);
        if (this.spawnPosition.lengthSqr() < 1e-6) {
            this.spawnPosition.set(this.node.worldPosition);
        }
    }

    public setSpawnPosition(pos: Vec3): void {
        this.spawnPosition.set(pos);
    }

    update(dt: number) {
        if (!this._tray) {
            return;
        }
        this._resolveJuiceMachine();
        this._tray.bindJuiceMachine(this.juiceMachine);

        const machine = this.juiceMachine;
        if (!machine?.isActivated) {
            this._setState(WaiterAIState.IdleAtSpawn);
            this._updateIdleAtSpawn(dt);
            return;
        }

        switch (this._state) {
            case WaiterAIState.IdleAtSpawn:
                this._updateIdleAtSpawn(dt);
                break;
            case WaiterAIState.GoToRack:
                this._updateGoToRack(dt);
                break;
            case WaiterAIState.GoToCounter:
                this._updateGoToCounter(dt);
                break;
            default:
                break;
        }
    }

    private _updateIdleAtSpawn(dt: number): void {
        if (this._shouldDeliver()) {
            this._setState(WaiterAIState.GoToCounter);
            return;
        }
        if (this._shouldPickup()) {
            this._setState(WaiterAIState.GoToRack);
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

    private _updateGoToRack(dt: number): void {
        const tray = this._tray!;
        if (this._shouldDeliver() && !this._shouldPickup()) {
            this._setState(WaiterAIState.GoToCounter);
            return;
        }
        if (!this._shouldPickup()) {
            this._setState(WaiterAIState.IdleAtSpawn);
            return;
        }

        if (tray.isInRackPickupRange()) {
            this._movement?.setMoving(false);
            if (this._shouldDeliver() && !this._shouldPickup()) {
                this._setState(WaiterAIState.GoToCounter);
            }
            return;
        }

        this._getRackNavTarget(this._navTarget);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);
        if (move.arrived || tray.isInRackPickupRange()) {
            this._movement?.setMoving(false);
        }
    }

    private _updateGoToCounter(dt: number): void {
        const tray = this._tray!;
        if (tray.carriedJuiceCount <= 0) {
            this._movement?.setMoving(false);
            this._setState(this._shouldPickup() ? WaiterAIState.GoToRack : WaiterAIState.IdleAtSpawn);
            return;
        }
        if (!hasPendingCustomerJuiceOrder()) {
            this._setState(WaiterAIState.IdleAtSpawn);
            return;
        }

        if (tray.isActorNearCounter()) {
            this._movement?.setMoving(false);
            return;
        }

        const counter = this._resolveCounter();
        if (!counter?.isValid) {
            this._movement?.setMoving(false);
            return;
        }

        counter.getWorldPosition(this._navTarget);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);
        if (move.arrived || tray.isActorNearCounter()) {
            this._movement?.setMoving(false);
        }
    }

    private _shouldPickup(): boolean {
        const tray = this._tray!;
        if (tray.carriedJuiceCount >= tray.maxCarryCount) {
            return false;
        }
        if (!hasPendingCustomerJuiceOrder()) {
            return false;
        }
        return this._getSceneJuiceCount() > 0;
    }

    private _shouldDeliver(): boolean {
        const tray = this._tray!;
        return tray.carriedJuiceCount > 0 && hasPendingCustomerJuiceOrder();
    }

    private _getSceneJuiceCount(): number {
        return this.juiceMachine?.sceneGlassCount ?? 0;
    }

    private _getRackNavTarget(out: Vec3): void {
        const rack = this.juiceMachine?.outputRack ?? GameSceneRefs.juiceOutputRack;
        if (rack?.isValid) {
            rack.getWorldPosition(out);
            return;
        }
        this.juiceMachine?.node.getWorldPosition(out);
    }

    private _resolveCounter(): Node | null {
        if (this._counterNode?.isValid) {
            return this._counterNode;
        }
        const pos = this.node.worldPosition;
        const counter = resolveNearestCounterDelivery(pos.x, pos.z);
        if (counter) {
            this._counterNode = counter;
        }
        return counter;
    }

    private _setState(state: WaiterAIState): void {
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
