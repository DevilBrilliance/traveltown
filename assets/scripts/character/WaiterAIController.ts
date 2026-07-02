import {
    _decorator,
    Component,
    Node,
    Vec3,
} from 'cc';
import { hasPendingCustomerJuiceOrder, resolvePendingOrderDeliveryNode } from '../order/CustomerOrderHelper';
import { BoundaryNavigator } from '../navigation/BoundaryNavigator';
import { PlayerJuiceTrayCarrier } from '../juice/PlayerJuiceTrayCarrier';
import { JuiceMachine } from '../juice/JuiceMachine';
import { GameSceneRefs } from '../scene/GameSceneRefs';
import { PlayAreaBoundary } from '../scene/PlayAreaBoundary';
import { WaiterMovementController } from './WaiterMovementController';

const { ccclass, property } = _decorator;

enum WaiterAIState {
    IdleAtSpawn,
    GoToRack,
    GoToCounter2Waypoint,
    GoToCounter,
}

/**
 * 服务员 AI：取场景果汁 → 收银台交付给顾客；无果汁或无订单时在出生点待机。
 * 前往收银台二时经途经点 (11,0,5)，返回同理。
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

    @property({ tooltip: '收银台二往返途经点' })
    counter2Waypoint = new Vec3(11, 0, 5);

    private _state = WaiterAIState.IdleAtSpawn;
    private _afterWaypointState = WaiterAIState.IdleAtSpawn;
    private _lastDeliveryWasCounter2 = false;
    private _tray: PlayerJuiceTrayCarrier | null = null;
    private _movement: WaiterMovementController | null = null;

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
            case WaiterAIState.GoToCounter2Waypoint:
                this._updateGoToCounter2Waypoint(dt);
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
            this._beginGoToCounter();
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
        if (this._shouldDeliver()) {
            this._beginGoToCounter();
            return;
        }
        if (!this._shouldPickup()) {
            this._setState(WaiterAIState.IdleAtSpawn);
            return;
        }

        if (tray.isInRackPickupRange()) {
            this._movement?.setMoving(false);
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

    private _updateGoToCounter2Waypoint(dt: number): void {
        this._navTarget.set(this.counter2Waypoint);
        const move = BoundaryNavigator.moveToward(
            this.node,
            this._navTarget,
            this.moveSpeed,
            dt,
            this.boundary,
            this.arriveRadius,
        );
        this._movement?.setMoving(move.moving);
        if (move.arrived || this._isNearCounter2Waypoint()) {
            this._movement?.setMoving(false);
            this._setState(this._afterWaypointState);
        }
    }

    private _updateGoToCounter(dt: number): void {
        const tray = this._tray!;
        if (tray.carriedJuiceCount <= 0) {
            this._movement?.setMoving(false);
            this._leaveCounterFor(this._shouldPickup()
                ? WaiterAIState.GoToRack
                : WaiterAIState.IdleAtSpawn);
            return;
        }
        if (!hasPendingCustomerJuiceOrder()) {
            this._leaveCounterFor(WaiterAIState.IdleAtSpawn);
            return;
        }

        if (tray.isActorNearCounter()) {
            this._movement?.setMoving(false);
            const counter = this._resolveCounter();
            if (counter) {
                this._lastDeliveryWasCounter2 = this._isCounter2Delivery(counter);
            }
            return;
        }

        const counter = this._resolveCounter();
        if (!counter?.isValid) {
            this._movement?.setMoving(false);
            return;
        }

        this._lastDeliveryWasCounter2 = this._isCounter2Delivery(counter);
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

    /** 托盘有果汁且有待交付订单时优先去收银台（不必等托盘满） */
    private _shouldPickup(): boolean {
        const tray = this._tray!;
        if (tray.carriedJuiceCount > 0) {
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

    private _beginGoToCounter(): void {
        const counter = this._resolveCounter();
        if (this._isCounter2Delivery(counter) && !this._isNearCounter2Waypoint()) {
            this._goViaCounter2Waypoint(WaiterAIState.GoToCounter);
            return;
        }
        this._setState(WaiterAIState.GoToCounter);
    }

    private _leaveCounterFor(next: WaiterAIState): void {
        if (this._lastDeliveryWasCounter2 && !this._isNearCounter2Waypoint()) {
            this._goViaCounter2Waypoint(next);
            return;
        }
        this._lastDeliveryWasCounter2 = false;
        this._setState(next);
    }

    private _goViaCounter2Waypoint(next: WaiterAIState): void {
        this._afterWaypointState = next;
        this._setState(WaiterAIState.GoToCounter2Waypoint);
    }

    private _isNearCounter2Waypoint(): boolean {
        const pos = this.node.worldPosition;
        const wp = this.counter2Waypoint;
        const dx = pos.x - wp.x;
        const dz = pos.z - wp.z;
        return dx * dx + dz * dz <= this.arriveRadius * this.arriveRadius;
    }

    private _isCounter2Delivery(counter: Node | null): boolean {
        const c2 = GameSceneRefs.counter2DeliveryNode;
        if (!counter?.isValid || !c2?.isValid) {
            return false;
        }
        if (counter === c2) {
            return true;
        }
        let node: Node | null = counter;
        while (node) {
            if (node === c2) {
                return true;
            }
            node = node.parent;
        }
        return counter.name === 'ZuoZi-001';
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
        return resolvePendingOrderDeliveryNode();
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
