import { CurrencyCost, currencyCost, CurrencyType } from '../currency/CurrencyType';
import { OrderManager } from './OrderManager';
import { OrderSubjectType } from './OrderSubjectType';
import { OrderInfo } from './OrderTypes';

const MIN_JUICE = 2;
const MAX_JUICE = 5;

/** 全部顾客订单完成后，延迟多久再刷出新订单（秒） */
export const CUSTOMER_ORDER_RENEW_DELAY_SEC = 5;

/** 顾客菠萝汁订单随机数量（2~5 杯） */
export function rollCustomerJuiceRequirement(): CurrencyCost {
    const amount = MIN_JUICE + Math.floor(Math.random() * (MAX_JUICE - MIN_JUICE + 1));
    return currencyCost(CurrencyType.PineappleJuice, amount);
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
