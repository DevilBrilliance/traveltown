import { director, Node } from 'cc';
import { JuiceRackBounds } from './JuiceRackBounds';

/** 收银台果汁交付点节点名（椅子） */
const COUNTER_DELIVERY_NODE_NAMES = ['ZuoZi', 'zuozi'];

/** 默认交付范围（世界单位） */
export const COUNTER_DELIVERY_RADIUS = 2;

function findChildDeep(root: Node, name: string): Node | null {
    if (root.name === name) {
        return root;
    }
    for (const child of root.children) {
        const found = findChildDeep(child, name);
        if (found) {
            return found;
        }
    }
    return null;
}

/** 查找收银台果汁交付点（ZuoZi），不填 Island 则自动查找 */
export function resolveCounterDeliveryNode(island?: Node | null): Node | null {
    const root = island ?? director.getScene()?.getChildByName('Island') ?? null;
    if (!root) {
        return null;
    }
    for (const name of COUNTER_DELIVERY_NODE_NAMES) {
        const node = findChildDeep(root, name);
        if (node?.isValid) {
            return node;
        }
    }
    return null;
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
