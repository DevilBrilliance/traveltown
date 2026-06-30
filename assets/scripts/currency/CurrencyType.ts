/** 钱币类型 */
export enum CurrencyType {
    /** 菠萝汁 */
    PineappleJuice = 0,
    /** 普通金币 */
    GoldCoin = 1,
}

export const CURRENCY_LABELS: Record<CurrencyType, string> = {
    [CurrencyType.PineappleJuice]: '菠萝汁',
    [CurrencyType.GoldCoin]: '普通金币',
};

/** 单笔消耗描述 */
export interface CurrencyCost {
    type: CurrencyType;
    amount: number;
}

export function currencyCost(type: CurrencyType, amount: number): CurrencyCost {
    return { type, amount };
}
