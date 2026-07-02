import { Node, Vec3 } from 'cc';

/** 引导完成条件类型 */
export enum GuideConditionType {
    /** 拾取金币 */
    CollectMoney = 'collect_money',
    /** 解锁购买区 */
    UnlockPurchaseZone = 'unlock_purchase_zone',
    /** 采集菠萝 */
    CollectPineapple = 'collect_pineapple',
    /** 向榨汁机投菠萝 */
    DepositPineapple = 'deposit_pineapple',
    /** 从果汁架取一杯果汁 */
    CollectJuice = 'collect_juice',
    /** 在收银台交付一杯果汁 */
    DeliverJuice = 'deliver_juice',
}

/** 引导箭头指向目标 */
export enum GuideTargetKind {
    /** 读取 GameSceneRefs 上的节点 */
    SceneRef = 'scene_ref',
    /** 直接节点引用 */
    Node = 'node',
    /** 运行时动态解析 */
    Dynamic = 'dynamic',
}

/** 动态目标键 */
export enum GuideDynamicTarget {
    FirstMoney = 'first_money',
    FirstPineapple = 'first_pineapple',
    PineappleField = 'pineapple_field',
    PendingCustomerDelivery = 'pending_customer_delivery',
}

/** GameSceneRefs 中可作为引导目标的键 */
export type GuideSceneRefKey =
    | 'counterPurchaseZone'
    | 'juiceMachineZone'
    | 'juiceOutputRack'
    | 'counterDeliveryNode'
    | 'workerPurchaseZone'
    | 'cashierPurchaseZone'
    | 'landExpansionPurchaseZone'
    | 'pineappleField';

/** 单条完成条件 */
export interface GuideCondition {
    type: GuideConditionType;
    /** 需要完成的数量，默认 1 */
    amount?: number;
    /** 解锁购买区时匹配的 orderSubjectId */
    subjectId?: string;
}

/** 箭头指向配置 */
export interface GuideTargetConfig {
    kind: GuideTargetKind;
    sceneRefKey?: GuideSceneRefKey;
    node?: Node | null;
    dynamicKey?: GuideDynamicTarget;
    /** 箭头相对目标世界坐标的偏移 */
    worldOffset?: Vec3;
    /** 固定世界坐标（直接摆放箭头，用于菠萝等） */
    fixedWorldPosition?: Vec3;
    /** 固定世界欧拉角 */
    fixedWorldEuler?: Vec3;
}

/** 引导任务配置 */
export interface GuideTaskConfig {
    /** 引导任务 id */
    id: string;
    /** 完成条件（全部满足即完成，可扩展多条） */
    conditions: GuideCondition[];
    /** 完成后解锁的后续引导任务 id 列表 */
    nextTaskIds: string[];
    /** 箭头指向 */
    target: GuideTargetConfig;
}

export interface GuideNotifyPayload {
    amount?: number;
    subjectId?: string;
}
