/** 奖励类型 */
export enum RewardType {
    /** 工人 */
    Worker = 0,
    /** 菠萝汁 */
    PineappleJuice = 1,
    /** 普通金币 */
    GoldCoin = 2,
}

/** 雇佣岗位：田间工人 / 柜台服务员 */
export enum StaffRole {
    Worker = 0,
    Waiter = 1,
}

/** 工人类型（奖励工人时使用） */
export enum WorkerRewardVariant {
    /** 工人 nan2 */
    WorkerNan2 = 0,
    /** 工人 nv1 */
    WorkerNv1 = 1,
}

export const REWARD_TYPE_LABELS: Record<RewardType, string> = {
    [RewardType.Worker]: '工人',
    [RewardType.PineappleJuice]: '菠萝汁',
    [RewardType.GoldCoin]: '普通金币',
};

export const WORKER_VARIANT_LABELS: Record<WorkerRewardVariant, string> = {
    [WorkerRewardVariant.WorkerNan2]: '工人 nan2',
    [WorkerRewardVariant.WorkerNv1]: '工人 nv1',
};
