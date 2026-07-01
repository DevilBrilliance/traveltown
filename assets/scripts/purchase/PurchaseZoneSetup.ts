import { Node, Vec3 } from 'cc';
import { WorkerRewardVariant } from '../reward/RewardType';
import { PurchaseZone } from './PurchaseZone';

export interface PurchaseZoneConfig {
    costAmount: number;
    displayName: string;
    orderSubjectId: string;
    rewardIconPath?: string;
    grantWorkerCount?: number;
    grantWorkerVariant?: WorkerRewardVariant;
    workerSpawnPosition?: Vec3;
    unlockTarget?: Node | null;
}

/**
 * 在 Island 下创建/配置购买区节点（默认 inactive，需调用 activate() 显示）。
 */
export function ensurePurchaseZone(
    parent: Node,
    name: string,
    worldPosition: Vec3,
    config: PurchaseZoneConfig,
): PurchaseZone {
    let node = parent.getChildByName(name);
    if (!node) {
        node = new Node(name);
        node.setParent(parent);
    }
    node.setWorldPosition(worldPosition);
    if (node.active) {
        node.active = false;
    }

    const zone = node.getComponent(PurchaseZone) ?? node.addComponent(PurchaseZone);
    zone.costAmount = config.costAmount;
    zone.displayName = config.displayName;
    zone.orderSubjectId = config.orderSubjectId;
    zone.rewardIconPath = config.rewardIconPath ?? '';
    zone.grantWorkerCount = config.grantWorkerCount ?? 0;
    if (config.grantWorkerVariant !== undefined) {
        zone.grantWorkerVariant = config.grantWorkerVariant;
    }
    if (config.workerSpawnPosition) {
        zone.workerSpawnPosition = config.workerSpawnPosition.clone();
    }
    zone.unlockTarget = config.unlockTarget ?? null;
    if (!zone.isPurchased) {
        node.active = false;
    }
    return zone;
}
