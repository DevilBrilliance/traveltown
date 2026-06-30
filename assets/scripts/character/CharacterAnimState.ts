import { CharacterAppearanceType } from './CharacterAppearanceType';

/**
 * 角色动画状态枚举
 */
export enum CharacterAnimState {
    /** 顾客待机 */
    CustomerIdle,
    /** 收割 */
    Harvest,
    /** 玩家跑步 */
    PlayerRun,
    /** 玩家待机 */
    PlayerIdle,
    /** NPC 待机 */
    NpcIdle,
    /** NPC 跑 */
    NpcRun,
}

/** FBX 动画片段路径（相对 assets/resources，不含扩展名） */
export const CHARACTER_ANIM_PATHS: Record<CharacterAnimState, string> = {
    [CharacterAnimState.CustomerIdle]: 'charaction/char/NPC_YCidLe',
    [CharacterAnimState.Harvest]: 'charaction/char/NPC_SRun',
    [CharacterAnimState.PlayerRun]: 'charaction/char/NPC_Run',
    [CharacterAnimState.PlayerIdle]: 'charaction/char/NPC_idLe',
    [CharacterAnimState.NpcIdle]: 'charaction/char/NPC_DXZ/NPC_DXZ_idle',
    [CharacterAnimState.NpcRun]: 'charaction/char/NPC_DXZ/NPC_DXZ_Run',
};

/** resources 路径失败时的 AnimationClip 子资源 UUID 兜底 */
export const CHARACTER_ANIM_CLIP_UUIDS: Record<CharacterAnimState, string> = {
    [CharacterAnimState.CustomerIdle]: 'c24f8cd0-8cd1-48d3-a538-237bfeeb7e07@73b7f',
    [CharacterAnimState.Harvest]: '7925855b-56ca-4a61-ac27-f58835f0d0d4@73b7f',
    [CharacterAnimState.PlayerRun]: '96c5cd33-b805-4c99-ba34-3ab3f6e7b796@73b7f',
    [CharacterAnimState.PlayerIdle]: 'e570ac2d-69e0-4f82-b2c0-6900069ec172@73b7f',
    [CharacterAnimState.NpcIdle]: 'bcb0a8ee-a7f9-487f-93b1-c52890bb31bb@73b7f',
    [CharacterAnimState.NpcRun]: '481e35b7-bc4b-4d6a-843e-9055f27e79e9@73b7f',
};

/** FBX 导出的默认片段名 */
export const CHARACTER_ANIM_CLIP_SUB_NAME = 'Take 001';

/** 根据形象返回默认待机动画 */
export function getDefaultAnimForAppearance(appearance: CharacterAppearanceType): CharacterAnimState {
    switch (appearance) {
        case CharacterAppearanceType.Customer0:
        case CharacterAppearanceType.Customer1:
            return CharacterAnimState.CustomerIdle;
        default:
            return CharacterAnimState.PlayerIdle;
    }
}
