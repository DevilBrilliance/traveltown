import {
    _decorator,
    Component,
    Vec3,
} from 'cc';
import { CurrencyType } from '../../currency/CurrencyType';
import { PlayerJuiceTrayCarrier } from '../../juice/PlayerJuiceTrayCarrier';
import { OrderManager } from '../../order/OrderManager';
import { OrderSubjectType } from '../../order/OrderSubjectType';
import { OrderInfo, OrderStatus } from '../../order/OrderTypes';
import { GameSceneRefs } from '../../scene/GameSceneRefs';
import { BUBBLE_BG_GREEN_PATH, BUBBLE_BG_PATH } from './BubbleIconPaths';
import { SpeechBubbleManager } from './SpeechBubbleManager';

const { ccclass, property } = _decorator;

/**
 * 将订单需求同步为需求者头顶气泡（subjectId → icon + x 数量）。
 */
@ccclass('OrderBubbleBinder')
export class OrderBubbleBinder extends Component {
    @property({ tooltip: '相对目标本地坐标头顶偏移（脚底 pivot 时 Y≈4）' })
    localOffset = new Vec3(0, 4, 0);

    private _bubbleMgr: SpeechBubbleManager | null = null;
    private readonly _bubbleIds = new Map<string, string>();
    private readonly _onOrdersChanged = (): void => {
        this.refresh();
    };
    private readonly _onJuiceTrayChanged = (): void => {
        this.refresh();
    };

    onLoad() {
        this._bubbleMgr = SpeechBubbleManager.ensure();
        OrderManager.ensure().onOrdersChanged(this._onOrdersChanged);
        this._bindJuiceTrayListener();
        this.scheduleOnce(() => this.refresh(), 0);
    }

    onDestroy() {
        OrderManager.instance?.offOrdersChanged(this._onOrdersChanged);
        GameSceneRefs.protagonist?.off('juice-tray-changed', this._onJuiceTrayChanged, this);
        this._bubbleMgr?.hideAll();
    }

    /** 刷新全部待交付订单气泡 */
    public refresh(): void {
        const orders = OrderManager.instance?.getPendingOrders() ?? [];
        const alive = new Set<string>();

        for (const order of orders) {
            if (order.status !== OrderStatus.Pending || !order.subjectNode?.isValid) {
                continue;
            }
            if (order.requirements.length === 0) {
                continue;
            }

            alive.add(order.subjectId);
            const bubbleId = `order_${order.subjectId}`;
            this._bubbleMgr?.showOnTarget(
                bubbleId,
                order.subjectNode,
                order.requirements,
                this.localOffset,
                this._resolveBubbleBgPath(order),
            );
            this._bubbleIds.set(order.subjectId, bubbleId);
        }

        for (const [subjectId, bubbleId] of this._bubbleIds) {
            if (!alive.has(subjectId)) {
                this._bubbleMgr?.hide(bubbleId);
                this._bubbleIds.delete(subjectId);
            }
        }
    }

    private _bindJuiceTrayListener(): void {
        const protagonist = GameSceneRefs.protagonist;
        if (!protagonist?.isValid) {
            this.scheduleOnce(() => this._bindJuiceTrayListener(), 0.2);
            return;
        }
        protagonist.on('juice-tray-changed', this._onJuiceTrayChanged, this);
    }

    private _resolveBubbleBgPath(order: OrderInfo): string {
        if (order.subjectType !== OrderSubjectType.Customer) {
            return BUBBLE_BG_PATH;
        }
        const juiceReq = order.requirements.find((r) => r.type === CurrencyType.PineappleJuice);
        if (!juiceReq || juiceReq.amount <= 0) {
            return BUBBLE_BG_PATH;
        }
        const carried = GameSceneRefs.protagonist
            ?.getComponent(PlayerJuiceTrayCarrier)
            ?.carriedJuiceCount ?? 0;
        return carried >= juiceReq.amount ? BUBBLE_BG_GREEN_PATH : BUBBLE_BG_PATH;
    }
}
