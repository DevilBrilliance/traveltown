import { CurrencyType } from '../../currency/CurrencyType';

/** 气泡商品 icon（resources 路径，不含扩展名） */
export const BUBBLE_ICON_PATHS: Record<CurrencyType, string> = {
    [CurrencyType.PineappleJuice]: 'textures/水果UI/boluo',
    [CurrencyType.GoldCoin]: 'textures/输出UI/55单人_00001',
};

/** 气泡背景（resources 路径） */
export const BUBBLE_BG_PATH = 'textures/输出UI/长方形_白框';

/** 订单气泡 UI 预制体（resources 路径，不含扩展名） */
export const SPEECH_BUBBLE_PREFAB_PATH = 'prefabs/SpeechBubble';
