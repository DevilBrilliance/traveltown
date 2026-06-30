/**
 * 音效枚举，与 assets/audios 目录下的音频文件一一对应
 */
export enum SoundEffect {
    /** 升级音效 */
    Upgrade,
    /** 出现02 */
    Appear02,
    /** 嘟 */
    Beep,
    /** 开门 */
    OpenDoor,
    /** 跑步声 */
    Run,
    /** 砍菠萝 */
    ChopPineapple,
    /** 菠萝收集 */
    CollectPineapple,
    /** 果汁收集 */
    CollectJuice,
    /** 钱币收集 */
    CollectCoin,
    /** 投放成果汁 */
    PourJuice,
    /** 欢快+海浪（背景音乐） */
    BgmHappyWaves,
}

/** 枚举 -> 资源路径（相对 assets 目录，不含扩展名） */
export const SOUND_PATHS: Record<SoundEffect, string> = {
    [SoundEffect.Upgrade]: 'audios/升级音效',
    [SoundEffect.Appear02]: 'audios/出现02',
    [SoundEffect.Beep]: 'audios/嘟',
    [SoundEffect.OpenDoor]: 'audios/开门',
    [SoundEffect.Run]: 'audios/跑步声',
    [SoundEffect.ChopPineapple]: 'audios/砍菠萝',
    [SoundEffect.CollectPineapple]: 'audios/菠萝收集',
    [SoundEffect.CollectJuice]: 'audios/果汁收集',
    [SoundEffect.CollectCoin]: 'audios/钱币收集',
    [SoundEffect.PourJuice]: 'audios/投放成果汁',
    [SoundEffect.BgmHappyWaves]: 'audios/欢快+海浪_21s',
};
