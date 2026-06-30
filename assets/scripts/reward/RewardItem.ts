import { _decorator, Enum } from 'cc';
import { RewardType, WorkerRewardVariant } from './RewardType';

const { ccclass, property } = _decorator;

/** 编辑器可配的单项奖励 */
@ccclass('RewardItem')
export class RewardItem {
    @property({ type: Enum(RewardType), tooltip: '奖励类型' })
    rewardType: RewardType = RewardType.GoldCoin;

    @property({ tooltip: '奖励数量（工人=生成个数，钱币/果汁=增加数量）' })
    amount = 1;

    @property({ type: Enum(WorkerRewardVariant), tooltip: '工人类型（仅 rewardType=工人 时生效）' })
    workerVariant: WorkerRewardVariant = WorkerRewardVariant.WorkerNan2;
}

/** 代码发奖用的单项描述 */
export interface RewardGrantSpec {
    type: RewardType;
    amount: number;
    workerVariant?: WorkerRewardVariant;
}

export function toRewardGrantSpecs(items: RewardItem[]): RewardGrantSpec[] {
    const specs: RewardGrantSpec[] = [];
    for (const item of items) {
        if (item.amount <= 0) {
            continue;
        }
        specs.push({
            type: item.rewardType,
            amount: item.amount,
            workerVariant: item.workerVariant,
        });
    }
    return specs;
}

export function rewardSpec(
    type: RewardType,
    amount: number,
    workerVariant = WorkerRewardVariant.WorkerNan2,
): RewardGrantSpec {
    return { type, amount, workerVariant };
}
