import {
    _decorator,
    Component,
    director,
    Enum,
    instantiate,
    Layers,
    Node,
    Prefab,
    resources,
    Vec3,
} from 'cc';
import { CurrencyType } from '../currency/CurrencyType';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { PurchaseZoneView } from './PurchaseZoneView';
import { PURCHASE_ZONE_UI_PREFAB_PATH } from './PurchaseZonePaths';

const { ccclass, property } = _decorator;

@ccclass('PurchaseZone')
export class PurchaseZone extends Component {
    @property({ type: Enum(CurrencyType), tooltip: '消耗货币类型' })
    costType: CurrencyType = CurrencyType.GoldCoin;

    @property({ tooltip: '消耗数量' })
    costAmount = 50;

    @property({ type: Node, tooltip: '购买后激活的节点（如 SYJ 收银台）' })
    unlockTarget: Node | null = null;

    @property({ type: Prefab, tooltip: '购买区 UI 预制体（PurchaseZoneUI），不填则自动加载' })
    uiPrefab: Prefab | null = null;

    @property({ tooltip: '贴地 Y 偏移' })
    planeYOffset = 0.02;

    @property({ tooltip: 'UI 像素 → 世界单位缩放（预制体为像素单位，需要缩小）' })
    uiScale = new Vec3(0.006, 0.006, 0.006);

    @property({ tooltip: '玩家进入该半径（XZ）时触发购买' })
    triggerRadius = 1.4;

    @property({ tooltip: '进入范围且余额足够时自动购买' })
    autoPurchaseOnEnter = true;

    @property({ type: Node, tooltip: '玩家节点，不填则查找 Protagonist' })
    playerNode: Node | null = null;

    @property({ tooltip: '余额不足时 UI 变暗' })
    dimWhenUnaffordable = true;

    private _purchased = false;
    private _view: PurchaseZoneView | null = null;
    private _padNode: Node | null = null;
    private readonly _onBalanceChanged = () => this._updateAffordable();

    onLoad() {
        if (this.unlockTarget?.active) {
            this._purchased = true;
            this.node.active = false;
            return;
        }
        this._spawnUI();
    }

    start() {
        this._resolvePlayer();
        this._view?.setAmount(this.costAmount);
        CurrencyWallet.instance?.onBalanceChanged(this._onBalanceChanged);
        this._updateAffordable();
    }

    onDestroy() {
        CurrencyWallet.instance?.offBalanceChanged(this._onBalanceChanged);
    }

    update() {
        if (this._purchased || !this.autoPurchaseOnEnter) {
            return;
        }
        const player = this._resolvePlayer();
        if (player && this._isPlayerInRange(player)) {
            this.tryPurchase();
        }
    }

    public tryPurchase(): boolean {
        if (this._purchased) {
            return true;
        }
        const wallet = CurrencyWallet.instance ?? CurrencyWallet.ensure();
        if (!wallet.spend(this.costType, this.costAmount)) {
            return false;
        }
        this._purchased = true;
        if (this.unlockTarget?.isValid) {
            this.unlockTarget.active = true;
        }
        if (this._padNode?.isValid) {
            this._padNode.destroy();
        }
        this.node.active = false;
        this.node.emit('purchase-zone-unlocked', this.unlockTarget);
        return true;
    }

    public get isPurchased(): boolean {
        return this._purchased;
    }

    // ─── private ───────────────────────────────────────────────────────────

    private _spawnUI(): void {
        if (this.uiPrefab) {
            this._buildUI(this.uiPrefab);
            return;
        }
        resources.load(PURCHASE_ZONE_UI_PREFAB_PATH, Prefab, (err, prefab) => {
            if (err || !prefab || !this.isValid) {
                console.warn('[PurchaseZone] 加载 PurchaseZoneUI 失败', err);
                return;
            }
            this._buildUI(prefab);
        });
    }

    private _buildUI(prefab: Prefab): void {
        // pad 节点：贴地偏移
        const pad = new Node('PurchasePad');
        pad.setParent(this.node);
        pad.setPosition(0, this.planeYOffset, 0);
        pad.layer = Layers.Enum.DEFAULT;
        this._padNode = pad;

        // view 节点：世界 UI 根节点
        const viewNode = new Node('PurchaseZoneView');
        viewNode.setParent(pad);
        viewNode.setPosition(Vec3.ZERO);
        viewNode.layer = Layers.Enum.DEFAULT;

        const view = viewNode.addComponent(PurchaseZoneView);
        view.dimWhenUnaffordable = this.dimWhenUnaffordable;

        // 实例化预制体后交给 view 初始化
        const ui = instantiate(prefab);
        view.setup(ui, this.uiScale);

        this._view = view;
        this._view.setAmount(this.costAmount);
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

    private _updateAffordable(): void {
        if (!this.dimWhenUnaffordable || !this._view) {
            return;
        }
        const wallet = CurrencyWallet.instance;
        const affordable = wallet?.canAfford(this.costType, this.costAmount) ?? false;
        this._view.setAffordable(affordable);
    }

}
