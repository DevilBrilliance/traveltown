import { CurrencyType } from '../currency/CurrencyType';
import { BUBBLE_ICON_PATHS } from '../ui/bubble/BubbleIconPaths';

/** 购买区底板（resources 路径，不含扩展名） */
export const PURCHASE_ZONE_BG_PATH = 'textures/输出UI/长方形_白框';

/** 消耗货币 icon */
export const PURCHASE_COIN_ICON_PATH = BUBBLE_ICON_PATHS[CurrencyType.GoldCoin];

/** 解锁目标 icon（收银台） */
export const PURCHASE_REWARD_ICON_PATH = 'textures/输出UI/2收银台_00000';

/** 购买区 UI 预制体（resources 路径） */
export const PURCHASE_ZONE_UI_PREFAB_PATH = 'prefabs/PurchaseZoneUI';
