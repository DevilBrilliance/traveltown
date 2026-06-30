import { Node } from 'cc';
import { CurrencyCost } from '../currency/CurrencyType';
import { OrderSubjectType } from './OrderSubjectType';

/** 订单状态 */
export enum OrderStatus {
    /** 待交付 */
    Pending = 0,
    /** 已完成 */
    Fulfilled = 1,
    /** 已取消 */
    Cancelled = 2,
}

/** 运行时订单数据 */
export interface OrderInfo {
    /** 订单唯一 id */
    id: string;
    /** 主体 id（如 Counter、JuiceMachine） */
    subjectId: string;
    /** 主体类型 */
    subjectType: OrderSubjectType;
    /** 主体场景节点 */
    subjectNode: Node | null;
    /** 展示名（UI 用） */
    displayName: string;
    /** 需要的商品列表 */
    requirements: CurrencyCost[];
    /** 当前状态 */
    status: OrderStatus;
}

export type OrderListener = (order: OrderInfo) => void;
