import { Node } from 'cc';
import { CurrencyCost, currencyCost, CurrencyType } from '../currency/CurrencyType';
import {
    COUNTER_DELIVERY_RADIUS,
    isActorNearCounterDelivery,
    resolveCounterServiceNode,
} from '../juice/CounterDeliveryHelper';
import { OrderManager } from './OrderManager';
import { OrderSubjectType } from './OrderSubjectType';
import { OrderInfo } from './OrderTypes';

const MIN_JUICE = 2;
const MAX_JUICE = 5;

/** 顾客 subjectId → 对应交付点 ZuoZi */
const _customerDeliveryNodes = new Map<string, Node>();

/** 全部顾客订单完成后，延迟多久再刷出新订单（秒） */
export const CUSTOMER_ORDER_RENEW_DELAY_SEC = 5;

/** 顾客菠萝汁订单随机数量（2~5 杯） */
export function rollCustomerJuiceRequirement(): CurrencyCost {
    const amount = MIN_JUICE + Math.floor(Math.random() * (MAX_JUICE - MIN_JUICE + 1));
    return currencyCost(CurrencyType.PineappleJuice, amount);
}

/** 绑定顾客订单对应的 ZuoZi 交付点 */
export function registerCustomerDeliveryNode(subjectId: string, deliveryNode: Node | null): void {
    if (!subjectId || !deliveryNode?.isValid) {
        return;
    }
    _customerDeliveryNodes.set(subjectId, deliveryNode);
}

export function resolveCustomerDeliveryNode(subjectId: string): Node | null {
    const node = _customerDeliveryNodes.get(subjectId);
    return node?.isValid ? node : null;
}

/** 是否存在待交付的顾客菠萝汁订单 */
export function hasPendingCustomerJuiceOrder(): boolean {
    return findPendingCustomerJuiceOrder() !== null;
}

/** 取第一个待交付的顾客菠萝汁订单 */
export function findPendingCustomerJuiceOrder(): OrderInfo | null {
    const orders = OrderManager.instance?.getPendingOrders() ?? [];
    for (const order of orders) {
        if (order.subjectType !== OrderSubjectType.Customer) {
            continue;
        }
        const juice = order.requirements.find((r) => r.type === CurrencyType.PineappleJuice);
        if (juice && juice.amount > 0) {
            return order;
        }
    }
    return null;
}

/**
 * 取当前站位可提交的顾客订单：须在该顾客绑定的 ZuoZi 范围内。
 */
export function findDeliverableCustomerJuiceOrder(
    actorX: number,
    actorZ: number,
    radius = COUNTER_DELIVERY_RADIUS,
): OrderInfo | null {
    const orders = OrderManager.instance?.getPendingOrders() ?? [];
    for (const order of orders) {
        if (order.subjectType !== OrderSubjectType.Customer) {
            continue;
        }
        const juice = order.requirements.find((r) => r.type === CurrencyType.PineappleJuice);
        if (!juice || juice.amount <= 0) {
            continue;
        }
        const deliveryNode = resolveCustomerDeliveryNode(order.subjectId);
        if (!deliveryNode?.isValid) {
            continue;
        }
        if (isActorNearCounterDelivery(actorX, actorZ, deliveryNode, radius)) {
            return order;
        }
    }
    return null;
}

/** 首个待交付顾客订单对应的 ZuoZi（寻路/范围判定） */
export function resolvePendingOrderDeliveryNode(): Node | null {
    const order = findPendingCustomerJuiceOrder();
    if (!order) {
        return null;
    }
    return resolveCustomerDeliveryNode(order.subjectId);
}

/** 首个待交付顾客订单对应的 SYT（引导箭头） */
export function resolvePendingOrderServiceNode(): Node | null {
    return resolveCounterServiceNode(resolvePendingOrderDeliveryNode());
}
