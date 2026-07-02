import { Node, Vec3 } from 'cc';
import { JuiceRackBounds } from './JuiceRackBounds';
import { GameSceneRefs } from '../scene/GameSceneRefs';

/** 收银台服务区节点名（ZuoZi 子节点） */
export const COUNTER_SERVICE_NODE_NAME = 'SYT';

/** 收银台二服务区节点名（ZuoZi-001 子节点，找不到则退回 SYT / ZuoZi） */
export const COUNTER2_SERVICE_NODE_NAME = 'SYT2';

/** 默认交付范围（世界单位，相对 ZuoZi） */
export const COUNTER_DELIVERY_RADIUS = 2;

const _counterPos = new Vec3();

/** 在 ZuoZi 下查找 SYT / SYT2（收银台），找不到则退回 ZuoZi */
export function resolveCounterServiceNode(counterRoot: Node | null): Node | null {
    if (!counterRoot?.isValid) {
        return null;
    }
    const isCounter2 = /^ZuoZi-001$/i.test(counterRoot.name)
        || counterRoot === GameSceneRefs.counter2DeliveryNode;
    const preferredNames = isCounter2
        ? [COUNTER2_SERVICE_NODE_NAME, COUNTER_SERVICE_NODE_NAME]
        : [COUNTER_SERVICE_NODE_NAME, COUNTER2_SERVICE_NODE_NAME];
    for (const name of preferredNames) {
        const syt = findDescendantByName(counterRoot, name)
            ?? findDescendantByNameIgnoreCase(counterRoot, name);
        if (syt?.isValid) {
            return syt;
        }
    }
    return counterRoot;
}

/** 收银台果汁交付点（ZuoZi，优先读 GameSceneRefs） */
export function resolveCounterDeliveryNode(): Node | null {
    return GameSceneRefs.counterDeliveryNode;
}

/** 所有已解锁的收银台交付点（ZuoZi） */
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

/** 角色是否在任一 ZuoZi 交付范围内 */
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

/** 距角色最近的 ZuoZi */
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

/** 角色是否在指定 ZuoZi 交付范围内 */
export function isActorNearCounterDelivery(
    actorX: number,
    actorZ: number,
    counter: Node,
    radius = COUNTER_DELIVERY_RADIUS,
): boolean {
    return JuiceRackBounds.isPointNearNode(counter, actorX, actorZ, radius, true);
}

export function findDescendantByName(root: Node, name: string): Node | null {
    if (root.name === name) {
        return root;
    }
    for (const child of root.children) {
        const found = findDescendantByName(child, name);
        if (found) {
            return found;
        }
    }
    return null;
}

function findDescendantByNameIgnoreCase(root: Node, name: string): Node | null {
    if (root.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0) {
        return root;
    }
    for (const child of root.children) {
        const found = findDescendantByNameIgnoreCase(child, name);
        if (found) {
            return found;
        }
    }
    return null;
}
