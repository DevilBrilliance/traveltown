import { Node } from 'cc';
import { RewardGrantSpec } from './RewardItem';

/** 单次发奖结果 */
export interface RewardGrantResult {
    /** 是否全部发放成功 */
    success: boolean;
    /** 实际发放的内容 */
    granted: RewardGrantSpec[];
    /** 本次生成的工人节点 */
    spawnedWorkers: Node[];
}

export type RewardListener = (result: RewardGrantResult) => void;
