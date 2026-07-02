import { Node, Vec3 } from 'cc';
import { IslandSurfaceSampler } from '../scene/IslandSurfaceSampler';
import { WorkerRewardVariant, StaffRole } from '../reward/RewardType';
import { PurchaseZone } from './PurchaseZone';

export interface PurchaseZoneConfig {
    costAmount: number;
    displayName: string;
    orderSubjectId: string;
    rewardIconPath?: string;
    grantWorkerCount?: number;
    grantWorkerVariant?: WorkerRewardVariant;
    grantStaffRole?: StaffRole;
    workerSpawnPosition?: Vec3;
    workerSpawnPositions?: readonly Vec3[];
    workerLookAtTarget?: Vec3;
    unlockTarget?: Node | null;
}

function schedulePurchaseZoneResnaps(zone: PurchaseZone, island: Node, anchor: Vec3): void {
    const delays = [0.2, 0.5, 1.0];
    for (const delay of delays) {
        zone.scheduleOnce(() => {
            if (!zone.isValid) {
                return;
            }
            zone.applyWorldAnchor(anchor, island);
        }, delay);
    }
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
    const anchor = worldPosition.clone();

    let node = parent.getChildByName(name);
    if (!node) {
        node = new Node(name);
        node.setParent(parent);
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
    if (config.grantStaffRole !== undefined) {
        zone.grantStaffRole = config.grantStaffRole;
    }
    if (config.workerSpawnPositions && config.workerSpawnPositions.length > 0) {
        zone.setWorkerSpawnPositions(
            [...config.workerSpawnPositions],
            config.workerLookAtTarget,
        );
    } else if (config.workerSpawnPosition) {
        zone.workerSpawnPosition = config.workerSpawnPosition.clone();
    }
    zone.unlockTarget = config.unlockTarget ?? null;
    zone.applyWorldAnchor(anchor, parent);
    if (!zone.isPurchased) {
        node.active = false;
    }

    schedulePurchaseZoneResnaps(zone, parent, anchor);

    return zone;
}
