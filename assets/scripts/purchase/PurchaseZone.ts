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
import { CurrencyCost, CurrencyType, currencyCost } from '../currency/CurrencyType';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { PurchaseZoneUIView } from './PurchaseZoneUIView';
import { PURCHASE_ZONE_UI_PREFAB_PATH } from './PurchaseZonePaths';

const { ccclass, property } = _decorator;

/**
 * 地面购买区：PurchaseZoneUI 预制体 → 烘焙贴地 Mesh（用预制体里的图，可被 3D 遮挡）。
 */
@ccclass('PurchaseZone')
export class PurchaseZone extends Component {
    @property({ type: Enum(CurrencyType), tooltip: '消耗货币类型' })
    costType: CurrencyType = CurrencyType.GoldCoin;

    @property({ tooltip: '消耗数量' })
    costAmount = 50;

    @property({ type: Node, tooltip: '购买后显示/激活的节点（如 SYJ 收银台）' })
    unlockTarget: Node | null = null;

    @property({ type: Prefab, tooltip: '购买区 UI（PurchaseZoneUI.prefab），不填则自动加载' })
    uiPrefab: Prefab | null = null;

    @property({ tooltip: '贴地 Y 偏移' })
    planeYOffset = 0.02;

    @property({ tooltip: 'UI 像素 → 世界单位缩放' })
    uiScale = new Vec3(0.006, 0.006, 0.006);

    @property({ tooltip: '玩家进入该半径（世界 XZ）时尝试购买' })
    triggerRadius = 1.4;

    @property({ tooltip: '进入范围且余额足够时自动购买' })
    autoPurchaseOnEnter = true;

    @property({ type: Node, tooltip: '玩家节点，不填则查找 Protagonist' })
    playerNode: Node | null = null;

    @property({ tooltip: '余额不足时变暗' })
    dimWhenUnaffordable = true;

    private _purchased = false;
    private _padNode: Node | null = null;
    private _uiView: PurchaseZoneUIView | null = null;
    private readonly _onBalanceChanged = (): void => {
        this._updateAffordVisual();
    };

    onLoad() {
        if (this.unlockTarget?.active) {
            this._purchased = true;
            this.node.active = false;
            return;
        }
        this._ensureUI();
    }

    start() {
        this._resolvePlayer();
        this._uiView?.setAmount(this.costAmount);
        CurrencyWallet.instance?.onBalanceChanged(this._onBalanceChanged);
        this._updateAffordVisual();
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
        const cost = this._getCost();
        if (!wallet.spend(cost.type, cost.amount)) {
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

    private _getCost(): CurrencyCost {
        return currencyCost(this.costType, this.costAmount);
    }

    private _isPlayerInRange(player: Node): boolean {
        const playerPos = player.worldPosition;
        const zonePos = this.node.worldPosition;
        const dx = playerPos.x - zonePos.x;
        const dz = playerPos.z - zonePos.z;
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

    private _getOrCreatePad(): Node {
        if (this._padNode?.isValid) {
            return this._padNode;
        }
        const pad = new Node('PurchasePad');
        pad.setParent(this.node);
        pad.setPosition(0, this.planeYOffset, 0);
        pad.layer = Layers.Enum.DEFAULT;
        this._padNode = pad;
        return pad;
    }

    private _ensureUI(): void {
        if (this._uiView) {
            return;
        }
        if (this.uiPrefab) {
            this._spawnUI(this.uiPrefab);
            return;
        }
        resources.load(PURCHASE_ZONE_UI_PREFAB_PATH, Prefab, (err, prefab) => {
            if (err || !prefab || !this.isValid) {
                console.warn('[PurchaseZone] PurchaseZoneUI 预制体加载失败', err);
                return;
            }
            this._spawnUI(prefab);
        });
    }

    private _spawnUI(prefab: Prefab): void {
        const pad = this._getOrCreatePad();
        if (pad.getComponent(PurchaseZoneUIView)) {
            this._uiView = pad.getComponent(PurchaseZoneUIView);
            return;
        }

        const ui = instantiate(prefab);
        ui.setParent(pad);
        ui.setPosition(0, 0, 0);
        ui.setScale(1, 1, 1);
        ui.setRotationFromEuler(0, 0, 0);

        const view = pad.addComponent(PurchaseZoneUIView);
        view.dimWhenUnaffordable = this.dimWhenUnaffordable;
        view.buildFromPrefab(ui, this.uiScale);
        view.setAmount(this.costAmount);
        this._uiView = view;
    }

    private _updateAffordVisual(): void {
        if (!this.dimWhenUnaffordable || !this._uiView) {
            return;
        }
        const wallet = CurrencyWallet.instance;
        const affordable = wallet?.canAfford(this.costType, this.costAmount) ?? false;
        this._uiView.setAffordable(affordable);
    }
}
