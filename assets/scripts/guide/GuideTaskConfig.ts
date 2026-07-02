import { Vec3 } from 'cc';
import {
    GuideConditionType,
    GuideDynamicTarget,
    GuideTargetKind,
    GuideTaskConfig,
} from './GuideTypes';

/** 默认新手引导链（9 步） */
export const DEFAULT_GUIDE_TASKS: GuideTaskConfig[] = [
    {
        id: 'guide_01_collect_money',
        conditions: [{ type: GuideConditionType.CollectMoney, amount: 1 }],
        nextTaskIds: ['guide_02_unlock_counter'],
        target: {
            kind: GuideTargetKind.Dynamic,
            dynamicKey: GuideDynamicTarget.FirstMoney,
            worldOffset: new Vec3(0, 1.8, 0),
        },
    },
    {
        id: 'guide_02_unlock_counter',
        conditions: [{ type: GuideConditionType.UnlockPurchaseZone, subjectId: 'CounterPurchaseZone' }],
        nextTaskIds: ['guide_03_collect_pineapple'],
        target: {
            kind: GuideTargetKind.SceneRef,
            sceneRefKey: 'counterPurchaseZone',
            worldOffset: new Vec3(0, 2.2, 0),
        },
    },
    {
        id: 'guide_03_collect_pineapple',
        conditions: [{ type: GuideConditionType.CollectPineapple, amount: 1 }],
        nextTaskIds: ['guide_04_deposit_pineapple'],
        target: {
            kind: GuideTargetKind.Dynamic,
            dynamicKey: GuideDynamicTarget.FirstPineapple,
            fixedWorldPosition: new Vec3(24, 1.5, 3.5),
            fixedWorldEuler: new Vec3(-90, 90, 0),
        },
    },
    {
        id: 'guide_04_deposit_pineapple',
        conditions: [{ type: GuideConditionType.DepositPineapple, amount: 1 }],
        nextTaskIds: ['guide_05_collect_juice'],
        target: {
            kind: GuideTargetKind.SceneRef,
            sceneRefKey: 'juiceMachineZone',
            worldOffset: new Vec3(0, 2.5, 0),
        },
    },
    {
        id: 'guide_05_collect_juice',
        conditions: [{ type: GuideConditionType.CollectJuice, amount: 1 }],
        nextTaskIds: ['guide_06_deliver_juice'],
        target: {
            kind: GuideTargetKind.SceneRef,
            sceneRefKey: 'juiceOutputRack',
            worldOffset: new Vec3(0, 2.5, 0),
        },
    },
    {
        id: 'guide_06_deliver_juice',
        conditions: [{ type: GuideConditionType.DeliverJuice, amount: 1 }],
        nextTaskIds: ['guide_07_unlock_workers'],
        target: {
            kind: GuideTargetKind.SceneRef,
            sceneRefKey: 'counterDeliveryNode',
            worldOffset: new Vec3(0, 2.2, 0),
        },
    },
    {
        id: 'guide_07_unlock_workers',
        conditions: [{ type: GuideConditionType.UnlockPurchaseZone, subjectId: 'Unlock_Workers' }],
        nextTaskIds: ['guide_08_unlock_waiter'],
        target: {
            kind: GuideTargetKind.SceneRef,
            sceneRefKey: 'workerPurchaseZone',
            worldOffset: new Vec3(0, 2.2, 0),
        },
    },
    {
        id: 'guide_08_unlock_waiter',
        conditions: [{ type: GuideConditionType.UnlockPurchaseZone, subjectId: 'Unlock_Cashier' }],
        nextTaskIds: ['guide_09_unlock_land'],
        target: {
            kind: GuideTargetKind.SceneRef,
            sceneRefKey: 'cashierPurchaseZone',
            worldOffset: new Vec3(0, 2.2, 0),
        },
    },
    {
        id: 'guide_09_unlock_land',
        conditions: [{ type: GuideConditionType.UnlockPurchaseZone, subjectId: 'Unlock_LandExpansion' }],
        nextTaskIds: [],
        target: {
            kind: GuideTargetKind.SceneRef,
            sceneRefKey: 'landExpansionPurchaseZone',
            worldOffset: new Vec3(0, 2.2, 0),
        },
    },
];
