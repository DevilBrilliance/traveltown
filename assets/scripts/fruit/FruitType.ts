/** 可采集水果类型 */
export enum FruitType {
    /** 菠萝 */
    Pineapple = 0,
    /** 橘子 */
    Orange = 1,
}

export const FRUIT_TYPE_LABELS: Record<FruitType, string> = {
    [FruitType.Pineapple]: '菠萝',
    [FruitType.Orange]: '橘子',
};
