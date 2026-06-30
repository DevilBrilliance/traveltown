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

/** 顾客贴图路径（相对 assets） */
export const CUSTOMER_TEXTURE_PATHS: Record<CharacterAppearanceType.Customer0 | CharacterAppearanceType.Customer1, string> = {
    [CharacterAppearanceType.Customer0]: 'models/模型/Texture/人物/顾客0',
    [CharacterAppearanceType.Customer1]: 'models/模型/Texture/人物/顾客1',
};

/** Geometry 下身体节点名 */
export const BODY_NODE_NAMES = ['nv2', 'nan2', 'nv1'] as const;

/** Geometry 下道具节点名 */
export const PROP_NODE_NAMES = ['duck02', 'duck01', 'ld'] as const;

/** NPC_RIG 预制体路径（相对 assets） */
export const NPC_RIG_PREFAB_PATH = 'models/模型动作/人物/NPC_RIG';
