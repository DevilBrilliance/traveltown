import { _decorator, Enum } from 'cc';
import { CurrencyCost, CurrencyType } from '../currency/CurrencyType';

const { ccclass, property } = _decorator;

/** 编辑器可配的单项商品需求 */
@ccclass('OrderRequirementItem')
export class OrderRequirementItem {
    @property({ type: Enum(CurrencyType), tooltip: '需要的商品类型' })
    goodsType: CurrencyType = CurrencyType.GoldCoin;

    @property({ tooltip: '需要数量（>0）' })
    amount = 1;
}

export function toCurrencyCosts(items: OrderRequirementItem[]): CurrencyCost[] {
    const costs: CurrencyCost[] = [];
    for (const item of items) {
        if (item.amount > 0) {
            costs.push({ type: item.goodsType, amount: item.amount });
        }
    }
    return costs;
}
