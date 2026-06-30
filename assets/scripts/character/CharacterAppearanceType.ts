/**
 * 角色形象枚举（共 5 种）
 * - 主角：nv2
 * - 工人：nan2 / nv1
 * - 顾客：nan2 + 顾客贴图 0 / 1
 */
export enum CharacterAppearanceType {
    /** 主角 nv2 */
    Protagonist,
    /** 工人 nan2 */
    WorkerNan2,
    /** 工人 nv1 */
    WorkerNv1,
    /** 顾客 nan2 + 顾客0 贴图 */
    Customer0,
    /** 顾客 nan2 + 顾客1 贴图 */
    Customer1,
}

/** 顾客贴图路径（相对 assets/resources，不含扩展名） */
export const CUSTOMER_TEXTURE_PATHS: Record<CharacterAppearanceType.Customer0 | CharacterAppearanceType.Customer1, string> = {
    [CharacterAppearanceType.Customer0]: 'charaction/char/chartietu/顾客0',
    [CharacterAppearanceType.Customer1]: 'charaction/char/chartietu/顾客1',
};

/** 顾客贴图 Texture2D 子资源 UUID（resources 路径失败时的兜底） */
export const CUSTOMER_TEXTURE_UUIDS: Record<CharacterAppearanceType.Customer0 | CharacterAppearanceType.Customer1, string> = {
    [CharacterAppearanceType.Customer0]: '82f66091-4eb7-4cfb-b40e-88a6fcb97e02@6c48a',
    [CharacterAppearanceType.Customer1]: '77b31af9-e501-4aa9-9e98-59d7e5f950b9@6c48a',
};

/** Geometry 下身体节点名 */
export const BODY_NODE_NAMES = ['nv2', 'nan2', 'nv1'] as const;

/** Geometry 下道具节点名 */
export const PROP_NODE_NAMES = ['duck02', 'duck01', 'ld'] as const;

/** NPC_RIG 路径（相对 assets/resources，不含扩展名） */
export const NPC_RIG_PREFAB_PATH = 'characters/NPC_RIG';

/** NPC_RIG FBX 导出的预制体子资源 UUID（resources 路径失败时的兜底） */
export const NPC_RIG_PREFAB_UUID = 'ffc2f5d8-b0e0-4aad-99cf-0d7268106432@6dea6';
