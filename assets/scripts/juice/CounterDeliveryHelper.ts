import { Node } from 'cc';
import { JuiceRackBounds } from './JuiceRackBounds';
import { GameSceneRefs } from '../scene/GameSceneRefs';

/** 默认交付范围（世界单位） */
export const COUNTER_DELIVERY_RADIUS = 2;

/** 收银台果汁交付点（优先读 GameSceneRefs） */
export function resolveCounterDeliveryNode(): Node | null {
    return GameSceneRefs.counterDeliveryNode;
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
