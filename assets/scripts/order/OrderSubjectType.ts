/** 订单主体类型（谁需要商品） */
export enum OrderSubjectType {
    /** 顾客 */
    Customer = 0,
    /** 柜台 */
    Counter = 1,
    /** 榨汁机 */
    JuiceMachine = 2,
    /** 工人 / NPC */
    Worker = 3,
}

export const ORDER_SUBJECT_LABELS: Record<OrderSubjectType, string> = {
    [OrderSubjectType.Customer]: '顾客',
    [OrderSubjectType.Counter]: '柜台',
    [OrderSubjectType.JuiceMachine]: '榨汁机',
    [OrderSubjectType.Worker]: '工人',
};
