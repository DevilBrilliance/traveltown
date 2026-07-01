import {
    _decorator,
    Component,
    director,
    Node,
} from 'cc';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { CurrencyCost, CURRENCY_LABELS, CurrencyType } from '../currency/CurrencyType';
import { OrderRequirementItem, toCurrencyCosts } from './OrderRequirement';
import { rollCustomerJuiceRequirement, CUSTOMER_ORDER_RENEW_DELAY_SEC } from './CustomerOrderHelper';
import { OrderInfo, OrderListener, OrderStatus } from './OrderTypes';
import { ORDER_SUBJECT_LABELS, OrderSubjectType } from './OrderSubjectType';
import { OrderSubject } from './OrderSubject';

const { ccclass } = _decorator;

let _orderSeq = 0;

/**
 * 全局订单系统：管理各主体需要的商品，校验并扣除玩家钱包完成交付。
 */
@ccclass('OrderManager')
export class OrderManager extends Component {
    private static _instance: OrderManager | null = null;

    public static get instance(): OrderManager | null {
        return OrderManager._instance;
    }

    public static ensure(): OrderManager {
        if (OrderManager._instance) {
            return OrderManager._instance;
        }
        const node = new Node('OrderManager');
        director.getScene()?.addChild(node);
        return node.addComponent(OrderManager)!;
    }

    private readonly _orders = new Map<string, OrderInfo>();
    private readonly _subjectToOrderId = new Map<string, string>();
    private readonly _fulfilledListeners = new Set<OrderListener>();
    private readonly _ordersChangedListeners = new Set<() => void>();
    private readonly _registeredSubjects = new Map<string, OrderSubject>();
    private _customerRenewPending = false;

    onLoad() {
        if (OrderManager._instance && OrderManager._instance !== this) {
            this.node.destroy();
            return;
        }
        OrderManager._instance = this;
        director.addPersistRootNode(this.node);
    }

    onDestroy() {
        this.unschedule(this._renewAllCustomerOrders);
        if (OrderManager._instance === this) {
            OrderManager._instance = null;
        }
    }

    public onOrderFulfilled(listener: OrderListener): void {
        this._fulfilledListeners.add(listener);
    }

    public offOrderFulfilled(listener: OrderListener): void {
        this._fulfilledListeners.delete(listener);
    }

    public onOrdersChanged(listener: () => void): void {
        this._ordersChangedListeners.add(listener);
    }

    public offOrdersChanged(listener: () => void): void {
        this._ordersChangedListeners.delete(listener);
    }

    /** 注册场景主体（OrderSubject 组件调用） */
    public registerSubject(subject: OrderSubject): void {
        const subjectId = subject.getSubjectId();
        this._registeredSubjects.set(subjectId, subject);

        const requirements = toCurrencyCosts(subject.requirements);
        if (requirements.length === 0) {
            return;
        }

        this._upsertOrder({
            subjectId,
            subjectType: subject.subjectType,
            subjectNode: subject.node,
            displayName: subject.getDisplayName(),
            requirements,
            repeatAfterFulfill: subject.repeatAfterFulfill,
        });
    }

    public unregisterSubject(subjectId: string): void {
        this._registeredSubjects.delete(subjectId);
        const orderId = this._subjectToOrderId.get(subjectId);
        if (orderId) {
            this._orders.delete(orderId);
            this._subjectToOrderId.delete(subjectId);
        }
        this._notifyOrdersChanged();
    }

    /**
     * 代码创建订单（不依赖场景组件）
     */
    public createOrder(options: {
        subjectId: string;
        subjectType: OrderSubjectType;
        requirements: CurrencyCost[] | OrderRequirementItem[];
        displayName?: string;
        subjectNode?: Node | null;
        repeatAfterFulfill?: boolean;
    }): OrderInfo | null {
        const requirements = Array.isArray(options.requirements)
            && options.requirements.length > 0
            && 'goodsType' in options.requirements[0]
            ? toCurrencyCosts(options.requirements as OrderRequirementItem[])
            : options.requirements as CurrencyCost[];

        if (requirements.length === 0) {
            return null;
        }

        return this._upsertOrder({
            subjectId: options.subjectId,
            subjectType: options.subjectType,
            subjectNode: options.subjectNode ?? null,
            displayName: options.displayName ?? options.subjectId,
            requirements,
            repeatAfterFulfill: options.repeatAfterFulfill ?? false,
        });
    }

    /** 获取全部待交付订单 */
    public getPendingOrders(): OrderInfo[] {
        return [...this._orders.values()].filter((o) => o.status === OrderStatus.Pending);
    }

    /** 按主体 id 查订单 */
    public getOrderBySubjectId(subjectId: string): OrderInfo | null {
        const orderId = this._subjectToOrderId.get(subjectId);
        return orderId ? this._orders.get(orderId) ?? null : null;
    }

    /**
     * 更新订单剩余需求（用于渐进交付，如购买区投币）
     */
    public syncRequirements(subjectId: string, requirements: CurrencyCost[]): void {
        const order = this.getOrderBySubjectId(subjectId);
        if (!order || order.status !== OrderStatus.Pending) {
            return;
        }
        order.requirements = requirements
            .filter((r) => r.amount > 0)
            .map((r) => ({ ...r }));
        this._notifyOrdersChanged();
    }

    /**
     * 标记订单完成（不扣款，适用于已在外部完成支付的订单）
     */
    public completeOrder(subjectId: string): boolean {
        const order = this.getOrderBySubjectId(subjectId);
        if (!order || order.status !== OrderStatus.Pending) {
            return false;
        }

        order.status = OrderStatus.Fulfilled;
        order.requirements = [];
        for (const listener of this._fulfilledListeners) {
            listener(order);
        }

        const subject = this._registeredSubjects.get(subjectId);
        if (order.subjectType === OrderSubjectType.Customer && subject?.isValid) {
            if (this._areAllCustomerOrdersFulfilled()) {
                this._scheduleCustomerOrdersRenewal();
            }
        }

        this._notifyOrdersChanged();
        return true;
    }

    private _areAllCustomerOrdersFulfilled(): boolean {
        let customerCount = 0;
        for (const subject of this._registeredSubjects.values()) {
            if (subject.subjectType !== OrderSubjectType.Customer) {
                continue;
            }
            customerCount += 1;
            const order = this.getOrderBySubjectId(subject.getSubjectId());
            if (!order || order.status === OrderStatus.Pending) {
                return false;
            }
        }
        return customerCount > 0;
    }

    private _scheduleCustomerOrdersRenewal(): void {
        if (this._customerRenewPending) {
            return;
        }
        this._customerRenewPending = true;
        this.scheduleOnce(this._renewAllCustomerOrders, CUSTOMER_ORDER_RENEW_DELAY_SEC);
    }

    private _renewAllCustomerOrders = (): void => {
        this._customerRenewPending = false;
        for (const subject of this._registeredSubjects.values()) {
            if (subject.subjectType !== OrderSubjectType.Customer || !subject.isValid) {
                continue;
            }
            const order = this.getOrderBySubjectId(subject.getSubjectId());
            if (!order) {
                continue;
            }
            this._renewCustomerOrder(order, subject);
        }
        this._notifyOrdersChanged();
    };

    /** 顾客订单完成后随机生成 2~5 杯菠萝汁的新需求 */
    private _renewCustomerOrder(order: OrderInfo, subject: OrderSubject): void {
        const next = rollCustomerJuiceRequirement();
        const item = new OrderRequirementItem();
        item.goodsType = next.type;
        item.amount = next.amount;
        subject.requirements = [item];

        order.status = OrderStatus.Pending;
        order.subjectNode = subject.node;
        order.requirements = [{ type: next.type, amount: next.amount }];
    }

    /** 玩家钱包是否满足该主体订单 */
    public canFulfill(subjectId: string): boolean {
        const order = this.getOrderBySubjectId(subjectId);
        if (!order || order.status !== OrderStatus.Pending) {
            return false;
        }
        return CurrencyWallet.instance?.canAffordAll(order.requirements) ?? false;
    }

    /**
     * 向指定主体交付订单商品（从玩家钱包扣除）
     * @returns 是否交付成功
     */
    public fulfill(subjectId: string): boolean {
        const order = this.getOrderBySubjectId(subjectId);
        if (!order || order.status !== OrderStatus.Pending) {
            return false;
        }

        const wallet = CurrencyWallet.instance ?? CurrencyWallet.ensure();
        if (!wallet.spendAll(order.requirements)) {
            return false;
        }

        order.status = OrderStatus.Fulfilled;
        for (const listener of this._fulfilledListeners) {
            listener(order);
        }

        const subject = this._registeredSubjects.get(subjectId);
        if (subject?.repeatAfterFulfill) {
            order.status = OrderStatus.Pending;
        }

        this._notifyOrdersChanged();
        return true;
    }

    /** 订单需求文字描述，如「柜台需要：菠萝汁×3、普通金币×10」 */
    public formatRequirements(order: OrderInfo): string {
        const parts = order.requirements.map(
            (r) => `${CURRENCY_LABELS[r.type]}×${r.amount}`,
        );
        const who = ORDER_SUBJECT_LABELS[order.subjectType] ?? order.displayName;
        return `${who}（${order.displayName}）需要：${parts.join('、')}`;
    }

    /** 查询某主体还缺哪些商品（用于 UI 提示） */
    public getShortage(subjectId: string): CurrencyCost[] {
        const order = this.getOrderBySubjectId(subjectId);
        if (!order || order.status !== OrderStatus.Pending) {
            return [];
        }
        const wallet = CurrencyWallet.instance;
        if (!wallet) {
            return [...order.requirements];
        }

        const shortage: CurrencyCost[] = [];
        for (const req of order.requirements) {
            const lack = req.amount - wallet.getBalance(req.type);
            if (lack > 0) {
                shortage.push({ type: req.type, amount: lack });
            }
        }
        return shortage;
    }

    private _upsertOrder(options: {
        subjectId: string;
        subjectType: OrderSubjectType;
        subjectNode: Node | null;
        displayName: string;
        requirements: CurrencyCost[];
        repeatAfterFulfill: boolean;
    }): OrderInfo {
        const existingId = this._subjectToOrderId.get(options.subjectId);
        const order: OrderInfo = {
            id: existingId ?? `order_${++_orderSeq}`,
            subjectId: options.subjectId,
            subjectType: options.subjectType,
            subjectNode: options.subjectNode,
            displayName: options.displayName,
            requirements: options.requirements.map((r) => ({ ...r })),
            status: OrderStatus.Pending,
        };

        this._orders.set(order.id, order);
        this._subjectToOrderId.set(options.subjectId, order.id);
        this._notifyOrdersChanged();
        return order;
    }

    private _notifyOrdersChanged(): void {
        for (const listener of this._ordersChangedListeners) {
            listener();
        }
    }
}
