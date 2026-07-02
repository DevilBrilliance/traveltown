import { Node, Vec3 } from 'cc';
import { JuiceRackBounds } from './JuiceRackBounds';
import { GameSceneRefs } from '../scene/GameSceneRefs';

/** 默认交付范围（世界单位） */
export const COUNTER_DELIVERY_RADIUS = 2;

const _counterPos = new Vec3();

/** 收银台果汁交付点（优先读 GameSceneRefs） */
export function resolveCounterDeliveryNode(): Node | null {
    return GameSceneRefs.counterDeliveryNode;
}

/** 所有已解锁的收银台交付点 */
export function resolveCounterDeliveryNodes(): Node[] {
    const nodes: Node[] = [];
    const primary = GameSceneRefs.counterDeliveryNode;
    const secondary = GameSceneRefs.counter2DeliveryNode;
    if (primary?.isValid) {
        nodes.push(primary);
    }
    if (secondary?.isValid && secondary !== primary) {
        nodes.push(secondary);
    }
    return nodes;
}

/** 角色是否在任一收银台交付范围内 */
export function isActorNearAnyCounterDelivery(
    actorX: number,
    actorZ: number,
    radius = COUNTER_DELIVERY_RADIUS,
): boolean {
    const counters = resolveCounterDeliveryNodes();
    for (const counter of counters) {
        if (isActorNearCounterDelivery(actorX, actorZ, counter, radius)) {
            return true;
        }
    }
    return false;
}

/** 距角色最近的收银台交付点 */
export function resolveNearestCounterDelivery(actorX: number, actorZ: number): Node | null {
    const counters = resolveCounterDeliveryNodes();
    if (counters.length === 0) {
        return null;
    }
    let best: Node | null = null;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (const counter of counters) {
        counter.getWorldPosition(_counterPos);
        const dx = actorX - _counterPos.x;
        const dz = actorZ - _counterPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            best = counter;
        }
    }
    return best;
}

/** 角色是否在收银台交付范围内 */
export function isActorNearCounterDelivery(
    actorX: number,
    actorZ: number,
    counter: Node,
    radius = COUNTER_DELIVERY_RADIUS,
): boolean {
    return JuiceRackBounds.isPointNearNode(counter, actorX, actorZ, radius, true);
}
