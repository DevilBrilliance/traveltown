import {
    _decorator,
    Component,
    director,
    Node,
} from 'cc';
import { CurrencyCost, CurrencyType } from './CurrencyType';

const { ccclass, property } = _decorator;

export type CurrencyBalanceListener = (type: CurrencyType, balance: number) => void;

/**
 * 全局钱币钱包：管理菠萝汁、普通金币的增减与消耗。
 */
@ccclass('CurrencyWallet')
export class CurrencyWallet extends Component {
    private static _instance: CurrencyWallet | null = null;

    public static get instance(): CurrencyWallet | null {
        return CurrencyWallet._instance;
    }

    /** 获取或创建全局钱包 */
    public static ensure(): CurrencyWallet {
        if (CurrencyWallet._instance) {
            return CurrencyWallet._instance;
        }
        const node = new Node('CurrencyWallet');
        director.getScene()?.addChild(node);
        return node.addComponent(CurrencyWallet)!;
    }

    @property({ tooltip: '初始菠萝汁数量' })
    initialPineappleJuice = 0;

    @property({ tooltip: '初始普通金币数量' })
    initialGoldCoin = 0;

    private readonly _balances = new Map<CurrencyType, number>();
    private readonly _listeners = new Set<CurrencyBalanceListener>();

    onLoad() {
        if (CurrencyWallet._instance && CurrencyWallet._instance !== this) {
            this.node.destroy();
            return;
        }
        CurrencyWallet._instance = this;
        director.addPersistRootNode(this.node);

        this._balances.set(CurrencyType.PineappleJuice, Math.max(0, this.initialPineappleJuice));
        this._balances.set(CurrencyType.GoldCoin, Math.max(0, this.initialGoldCoin));
    }

    onDestroy() {
        if (CurrencyWallet._instance === this) {
            CurrencyWallet._instance = null;
        }
    }

    /** 注册余额变化监听 */
    public onBalanceChanged(listener: CurrencyBalanceListener): void {
        this._listeners.add(listener);
    }

    public offBalanceChanged(listener: CurrencyBalanceListener): void {
        this._listeners.delete(listener);
    }

    /** 查询指定类型余额 */
    public getBalance(type: CurrencyType): number {
        return this._balances.get(type) ?? 0;
    }

    /** 是否足够支付单笔消耗 */
    public canAfford(type: CurrencyType, amount: number): boolean {
        return amount > 0 && this.getBalance(type) >= amount;
    }

    /** 是否足够支付多笔消耗（全部满足才为 true） */
    public canAffordAll(costs: CurrencyCost[]): boolean {
        return costs.every((cost) => this.canAfford(cost.type, cost.amount));
    }

    /**
     * 增加指定类型钱币（amount 必须 > 0）
     * @returns 增加后的余额
     */
    public add(type: CurrencyType, amount: number): number {
        if (amount <= 0) {
            return this.getBalance(type);
        }
        const next = this.getBalance(type) + amount;
        this._setBalance(type, next);
        return next;
    }

    /**
     * 消耗指定类型钱币；余额不足时不扣款
     * @returns 是否消耗成功
     */
    public spend(type: CurrencyType, amount: number): boolean {
        if (amount <= 0) {
            return true;
        }
        if (!this.canAfford(type, amount)) {
            return false;
        }
        this._setBalance(type, this.getBalance(type) - amount);
        return true;
    }

    /**
     * 同时消耗多种钱币；任意一种不足则整笔失败、不扣款
     * @returns 是否全部消耗成功
     */
    public spendAll(costs: CurrencyCost[]): boolean {
        if (costs.length === 0) {
            return true;
        }
        if (!this.canAffordAll(costs)) {
            return false;
        }
        for (const cost of costs) {
            this._setBalance(cost.type, this.getBalance(cost.type) - cost.amount);
        }
        return true;
    }

    /** 直接设置余额（调试用） */
    public setBalance(type: CurrencyType, balance: number): void {
        this._setBalance(type, Math.max(0, balance));
    }

    private _setBalance(type: CurrencyType, balance: number): void {
        const safe = Math.max(0, Math.floor(balance));
        this._balances.set(type, safe);
        for (const listener of this._listeners) {
            listener(type, safe);
        }
    }
}
