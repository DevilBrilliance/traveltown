import { _decorator, Component, Node, Vec3 } from 'cc';
import { BakedPurchaseUI, bakePurchaseUIPrefab } from './PurchaseZoneUIPrefabBaker';

const { ccclass, property } = _decorator;

/**
 * 购买区显示控制：预制体 Sprite → 透明贴地 Mesh，Label 保留预制体样式。
 */
@ccclass('PurchaseZoneUIView')
export class PurchaseZoneUIView extends Component {
    @property({ tooltip: '余额不足时变暗' })
    dimWhenUnaffordable = true;

    private _baked: BakedPurchaseUI | null = null;
    private _affordable = true;

    /** 从已实例化的 PurchaseZoneUI 预制体烘焙贴地 mesh，然后销毁 2D 节点 */
    public buildFromPrefab(uiRoot: Node, uiScale: Vec3): void {
        if (this._baked) {
            return;
        }
        this._baked = bakePurchaseUIPrefab(uiRoot, this.node, uiScale);
        uiRoot.destroy();
    }

    public setAmount(amount: number): void {
        this._baked?.setAmount(amount);
    }

    public setAffordable(affordable: boolean): void {
        if (this._affordable === affordable) {
            return;
        }
        this._affordable = affordable;
        this._baked?.setAffordable(affordable, this.dimWhenUnaffordable);
    }

    onDestroy() {
        this._baked?.destroy();
        this._baked = null;
    }
}
