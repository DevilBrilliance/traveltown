import { Vec3 } from 'cc';

/** 工人购买区世界 UI 位置（XZ；Y 由 IslandSurfaceSampler 贴地） */
export const WORKER_PURCHASE_POSITION = new Vec3(26, 0, 3.5);

/** 工人解锁后生成点（世界坐标，Y 贴地；靠近购买 UI） */
export const WORKER_SPAWN_POSITIONS: readonly Vec3[] = [
    new Vec3(25, 0, 2.2),
    new Vec3(26, 0, 2.0),
    new Vec3(27, 0, 2.2),
];

/** 工人面朝菠萝田的参考点（Island 下菠萝田中心约 Z=5） */
export const PINEAPPLE_FIELD_LOOK_AT = new Vec3(0, 0, 5);

/** 服务员购买区世界 UI 位置（XZ；Y 由 IslandSurfaceSampler 贴地） */
export const CASHIER_PURCHASE_POSITION = new Vec3(2, 0, -4);

/** 扩地购买区世界 UI 位置（XZ；Y 由 IslandSurfaceSampler 贴地） */
export const LAND_EXPANSION_PURCHASE_POSITION = new Vec3(27, 0, 6.5);
