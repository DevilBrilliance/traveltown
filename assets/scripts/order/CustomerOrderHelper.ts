import { CurrencyCost, currencyCost, CurrencyType } from '../currency/CurrencyType';

const MIN_JUICE = 2;
const MAX_JUICE = 5;

/** 顾客菠萝汁订单随机数量（2~5 杯） */
export function rollCustomerJuiceRequirement(): CurrencyCost {
    const amount = MIN_JUICE + Math.floor(Math.random() * (MAX_JUICE - MIN_JUICE + 1));
    return currencyCost(CurrencyType.PineappleJuice, amount);
}
