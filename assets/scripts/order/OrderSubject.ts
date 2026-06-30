import {
    _decorator,
    Component,
    Enum,
} from 'cc';
import { OrderManager } from './OrderManager';
import { OrderRequirementItem } from './OrderRequirement';
import { OrderSubjectType } from './OrderSubjectType';

const { ccclass, property } = _decorator;

/**
 * 挂在场景主体节点上，声明该主体需要哪些商品。
 * 例：柜台需要 3 杯菠萝汁，顾客需要 10 金币。
 */
@ccclass('OrderSubject')
export class OrderSubject extends Component {
    @property({ tooltip: '主体唯一 id，不填则用节点名' })
    subjectId = '';

    @property({ type: Enum(OrderSubjectType), tooltip: '主体类型' })
    subjectType: OrderSubjectType = OrderSubjectType.Counter;

    @property({ tooltip: '展示名（订单 UI）' })
    displayName = '';

    @property({ type: [OrderRequirementItem], tooltip: '需要的商品及数量' })
    requirements: OrderRequirementItem[] = [];

    @property({ tooltip: '完成后是否自动重置为待交付（循环订单）' })
    repeatAfterFulfill = false;

    @property({ tooltip: '启动时自动注册到订单系统' })
    registerOnLoad = true;

    onLoad() {
        if (this.registerOnLoad) {
            OrderManager.ensure().registerSubject(this);
        }
    }

    onDestroy() {
        OrderManager.instance?.unregisterSubject(this.getSubjectId());
    }

    public getSubjectId(): string {
        return this.subjectId || this.node.name;
    }

    public getDisplayName(): string {
        return this.displayName || this.getSubjectId();
    }
}
