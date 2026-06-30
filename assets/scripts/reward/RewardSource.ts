import {
    _decorator,
    Component,
    Vec3,
} from 'cc';
import { RewardManager } from './RewardManager';
import { RewardItem, toRewardGrantSpecs } from './RewardItem';
import { RewardGrantResult } from './RewardResult';
import { RewardType } from './RewardType';

const { ccclass, property } = _decorator;

/**
 * 挂在场景节点上，配置一组奖励并一键发放（如订单完成、关卡奖励）。
 */
@ccclass('RewardSource')
export class RewardSource extends Component {
    @property({ tooltip: '奖励来源 id（日志/UI 用）' })
    sourceId = '';

    @property({ type: [RewardItem], tooltip: '奖励列表' })
    rewards: RewardItem[] = [];

    @property({ tooltip: '发工人时使用该世界坐标（为零则用 RewardManager 默认点）' })
    workerSpawnPosition = new Vec3(0, 0, 0);

    @property({ tooltip: '勾选后 workerSpawnPosition 作为工人生成点' })
    useCustomWorkerSpawn = false;

    /** 发放本节点配置的全部奖励 */
    public grantRewards(): RewardGrantResult {
        const manager = RewardManager.ensure();
        const currencyItems: RewardItem[] = [];
        const workerItems: RewardItem[] = [];

        for (const item of this.rewards) {
            if (item.amount <= 0) {
                continue;
            }
            if (item.rewardType === RewardType.Worker) {
                workerItems.push(item);
            } else {
                currencyItems.push(item);
            }
        }

        const merged: RewardGrantResult = {
            success: true,
            granted: [],
            spawnedWorkers: [],
        };

        if (currencyItems.length > 0) {
            const part = manager.grant(currencyItems);
            merged.granted.push(...part.granted);
            merged.spawnedWorkers.push(...part.spawnedWorkers);
            if (!part.success) {
                merged.success = false;
            }
        }

        const spawnBase = this.useCustomWorkerSpawn ? this.workerSpawnPosition : undefined;
        for (const item of workerItems) {
            const workers = manager.grantWorker(item.amount, item.workerVariant, spawnBase);
            if (workers.length === item.amount) {
                merged.granted.push({
                    type: RewardType.Worker,
                    amount: item.amount,
                    workerVariant: item.workerVariant,
                });
                merged.spawnedWorkers.push(...workers);
            } else {
                merged.success = false;
            }
        }

        if (this.sourceId && merged.granted.length > 0) {
            console.log(`[RewardSource] ${this.sourceId} 发放: ${manager.formatRewards(merged.granted)}`);
        }

        return merged;
    }
}
