import { Node } from 'cc';
import type { JuiceMachine } from '../juice/JuiceMachine';

/**
 * 场景节点引用注册表。由 GameStart 在 Inspector 绑定并写入，其他系统直接读引用，避免按名查找。
 */
class GameSceneRefsImpl {
    public island: Node | null = null;

    /** 收银台果汁交付点（ZuoZi） */
    public counterDeliveryNode: Node | null = null;

    /** 场景果汁架（ZhaLan_Box） */
    public juiceOutputRack: Node | null = null;

    /** 榨汁机模型根（JiQi_RIG） */
    public juiceMachineRig: Node | null = null;

    /** 收银台解锁购买区 */
    public counterPurchaseZone: Node | null = null;

    public juiceMachine: JuiceMachine | null = null;

    public protagonist: Node | null = null;

    /** 首个可拾取金币（由 MoneyPickupSpawner 写入） */
    public firstMoneyPickup: Node | null = null;

    public workerPurchaseZone: Node | null = null;

    public cashierPurchaseZone: Node | null = null;

    public landExpansionPurchaseZone: Node | null = null;

    /** 菠萝田根节点 */
    public pineappleField: Node | null = null;

    /** 收银台二果汁交付点（ZuoZi-001） */
    public counter2DeliveryNode: Node | null = null;

    /** 橘子田根节点 */
    public juziField: Node | null = null;
}

export const GameSceneRefs = new GameSceneRefsImpl();
