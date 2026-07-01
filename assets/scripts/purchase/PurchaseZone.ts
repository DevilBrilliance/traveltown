import {
    _decorator,
    Component,
    director,
    Enum,
    Layers,
    Node,
    Vec3,
} from 'cc';
import { CurrencyCost, CurrencyType, currencyCost } from '../currency/CurrencyType';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { PurchaseZoneDecal } from './PurchaseZoneDecal';

const { ccclass, property } = _decorator;

/**
 * 地面购买区。
 *
 * 支持两种扣钱模式：
 *  - autoPurchaseOnEnter = true  → 玩家进入范围后每帧自动扣少量，填满进度条完成购买
 *  - autoPurchaseOnEnter = false → 外部调用 tryPurchase() 一次性完成
 */
@ccclass('PurchaseZone')
export class PurchaseZone extends Component {
    @property({ type: Enum(CurrencyType), tooltip: '消耗货币类型' })
    costType: CurrencyType = CurrencyType.GoldCoin;

    @property({ tooltip: '消耗总数量' })
    costAmount = 50;

    @property({ type: Node, tooltip: '购买后激活的节点（如 SYJ 收银台）' })
    unlockTarget: Node | null = null;

    @property({ tooltip: '贴地 Y 偏移' })
    planeYOffset = 0.02;

    @property({ tooltip: '玩家进入该半径（XZ）时开始扣钱' })
    triggerRadius = 1.4;

    @property({ tooltip: '进入范围后自动渐进扣钱（每秒扣 drainPerSecond 点）' })
    autoPurchaseOnEnter = true;

    @property({ tooltip: '自动模式：每秒扣钱量（0 = 与 costAmount 相同速率，1 秒内完成）' })
    drainPerSecond = 20;

    @property({ type: Node, tooltip: '玩家节点，不填则查找 Protagonist' })
    playerNode: Node | null = null;

    @property({ tooltip: '余额不足时贴花变暗' })
    dimWhenUnaffordable = true;

    private _purchased = false;
    private _paid = 0;
    private _padNode: Node | null = null;
    private _decal: PurchaseZoneDecal | null = null;
    private readonly _onBalanceChanged = (): void => this._updateAffordable();

    onLoad() {
        if (this.unlockTarget?.active) {
            this._purchased = true;
            this.node.active = false;
            return;
        }
        this._ensureDecal();
    }

    start() {
        this._resolvePlayer();
        this._decal?.setAmount(this.costAmount);
        CurrencyWallet.instance?.onBalanceChanged(this._onBalanceChanged);
        this._updateAffordable();
    }

    onDestroy() {
        CurrencyWallet.instance?.offBalanceChanged(this._onBalanceChanged);
    }

    update(dt: number) {
        if (this._purchased || !this.autoPurchaseOnEnter) {
            return;
        }
        const player = this._resolvePlayer();
        if (!player || !this._isPlayerInRange(player)) {
            return;
        }

        const wallet = CurrencyWallet.instance;
        if (!wallet) {
            return;
        }

        const ratePerFrame = this.drainPerSecond * dt;
        const remaining = this.costAmount - this._paid;
        const spend = Math.min(ratePerFrame, remaining);
        const spendInt = Math.floor(spend);

        if (spendInt > 0 && wallet.spend(this.costType, spendInt)) {
            this._paid += spendInt;
            const progress = this._paid / this.costAmount;
            this._decal?.setProgress(progress);
            this._decal?.setAmount(this.costAmount - this._paid);
            if (this._paid >= this.costAmount) {
                this._completePurchase();
            }
        }
    }

    /** 一次性购买（autoPurchaseOnEnter=false 时手动调用） */
    public tryPurchase(): boolean {
        if (this._purchased) {
            return true;
        }
        const wallet = CurrencyWallet.instance ?? CurrencyWallet.ensure();
        const cost = this._getCost();
        if (!wallet.spend(cost.type, cost.amount)) {
            return false;
        }
        this._paid = this.costAmount;
        this._decal?.setProgress(1);
        this._completePurchase();
        return true;
    }

    public get isPurchased(): boolean {
        return this._purchased;
    }

    private _completePurchase(): void {
        this._purchased = true;
        if (this.unlockTarget?.isValid) {
            this.unlockTarget.active = true;
        }
        this.scheduleOnce(() => {
            if (this._padNode?.isValid) {
                this._padNode.destroy();
            }
            if (this.node.isValid) {
                this.node.active = false;
            }
        }, 0.4);
        this.node.emit('purchase-zone-unlocked', this.unlockTarget);
    }

    private _getCost(): CurrencyCost {
        return currencyCost(this.costType, this.costAmount);
    }

    private _isPlayerInRange(player: Node): boolean {
        const pp = player.worldPosition;
        const zp = this.node.worldPosition;
        const dx = pp.x - zp.x;
        const dz = pp.z - zp.z;
        return dx * dx + dz * dz <= this.triggerRadius * this.triggerRadius;
    }

    private _resolvePlayer(): Node | null {
        if (this.playerNode?.isValid) {
            return this.playerNode;
        }
        const island = director.getScene()?.getChildByName('Island');
        this.playerNode = island?.getChildByName('Protagonist')
            ?? director.getScene()?.getChildByName('Protagonist')
            ?? null;
        return this.playerNode;
    }

    private _ensureDecal(): void {
        if (this._decal) {
            return;
        }
        const pad = new Node('PurchasePad');
        pad.setParent(this.node);
        pad.setPosition(new Vec3(0, this.planeYOffset, 0));
        pad.layer = Layers.Enum.DEFAULT;
        this._padNode = pad;
        this._decal = pad.addComponent(PurchaseZoneDecal);
        this._decal.dimWhenUnaffordable = this.dimWhenUnaffordable;
    }

    private _updateAffordable(): void {
        if (!this.dimWhenUnaffordable || !this._decal) {
            return;
        }
        const wallet = CurrencyWallet.instance;
        const affordable = wallet?.canAfford(this.costType, this.drainPerSecond) ?? false;
        this._decal.setAffordable(affordable);
    }
}
