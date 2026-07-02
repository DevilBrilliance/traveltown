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
    Sprite,
    SpriteFrame,
    Vec3,
} from 'cc';
import { CurrencyType } from '../currency/CurrencyType';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { OrderManager } from '../order/OrderManager';
import { OrderSubjectType } from '../order/OrderSubjectType';
import { WorkerRewardVariant, StaffRole } from '../reward/RewardType';
import { WorkerGrant } from '../reward/WorkerGrant';
import { RewardManager } from '../reward/RewardManager';
import { IslandSurfaceSampler } from '../scene/IslandSurfaceSampler';
import { GameSceneRefs } from '../scene/GameSceneRefs';
import { GuideManager } from '../guide/GuideManager';
import { GuideConditionType } from '../guide/GuideTypes';
import { PurchaseZoneView } from './PurchaseZoneView';
import { PURCHASE_ZONE_UI_PREFAB_PATH } from './PurchaseZonePaths';

const { ccclass, property } = _decorator;

/**
 * 购买区：玩家站在区域内持续投币，进度条填满后解锁目标（如收银台）。
 * 金币不足时也会扣除已有金币并更新对应进度。
 */
@ccclass('PurchaseZone')
export class PurchaseZone extends Component {
    @property({ type: Enum(CurrencyType), tooltip: '消耗货币类型' })
    costType: CurrencyType = CurrencyType.GoldCoin;

    @property({ tooltip: '总需求数量' })
    costAmount = 50;

    @property({ tooltip: '订单展示名称' })
    displayName = '收银台';

    @property({ tooltip: '奖励展示 icon（resources 路径，不含扩展名）' })
    rewardIconPath = '';

    @property({ tooltip: '解锁后生成的工人/服务员数量' })
    grantWorkerCount = 0;

    @property({ type: Enum(WorkerRewardVariant), tooltip: '解锁后生成的工人类型' })
    grantWorkerVariant: WorkerRewardVariant = WorkerRewardVariant.WorkerNan2;

    @property({ type: Enum(StaffRole), tooltip: '解锁后生成的岗位（工人 / 服务员）' })
    grantStaffRole: StaffRole = StaffRole.Worker;

    @property({ tooltip: '工人生成世界坐标（grantWorkerCount > 0 时）' })
    workerSpawnPosition = new Vec3(0, 0, 0);

    @property({ type: Node, tooltip: '购买后激活的节点（如 SYJ 收银台）' })
    unlockTarget: Node | null = null;

    @property({ type: Prefab, tooltip: '购买区 UI 预制体（PurchaseZoneUI），不填则自动加载' })
    uiPrefab: Prefab | null = null;

    @property({ tooltip: '贴地 Y 偏移' })
    planeYOffset = 0.02;

    @property({ tooltip: 'UI 像素 → 世界单位缩放（预制体为像素单位，需要缩小）' })
    uiScale = new Vec3(0.006, 0.006, 0.006);

    @property({ tooltip: '玩家进入该半径（XZ）时投币' })
    triggerRadius = 1.4;

    @property({ tooltip: '站在区域内时自动投币' })
    autoDepositOnStand = true;

    @property({ tooltip: '投币速度（枚/秒）' })
    depositPerSecond = 40;

    @property({ tooltip: '订单主体 id，不填则用节点名' })
    orderSubjectId = '';

    @property({ type: Node, tooltip: '玩家节点，不填则查找 Protagonist' })
    playerNode: Node | null = null;

    @property({ tooltip: '余额不足时 UI 变暗' })
    dimWhenUnaffordable = false;

    @property({ tooltip: '世界锚点（XZ 由 setup 写入，Y 贴地）' })
    anchorWorldPosition = new Vec3();

    private _paidAmount = 0;
    private _completed = false;
    private _view: PurchaseZoneView | null = null;
    private _padNode: Node | null = null;
    private readonly _workerSpawnPositions: Vec3[] = [];
    private readonly _workerLookAtTarget = new Vec3(0, 0, 5);
    private readonly _onBalanceChanged = () => this._updateAffordable();

    onLoad() {
        if (this.unlockTarget?.active) {
            this._completed = true;
            this._paidAmount = this.costAmount;
            this.node.active = false;
            return;
        }
        this._spawnUI();
    }

    start() {
        this._resolvePlayer();
        this._registerOrder();
        this._refreshUI();
        CurrencyWallet.instance?.onBalanceChanged(this._onBalanceChanged);
        this._updateAffordable();
    }

    onDestroy() {
        CurrencyWallet.instance?.offBalanceChanged(this._onBalanceChanged);
    }

    update(dt: number) {
        if (this._completed || !this.autoDepositOnStand) {
            return;
        }
        const player = this._resolvePlayer();
        if (!player || !this._isPlayerInRange(player)) {
            return;
        }
        this._depositWhileStanding(dt);
    }

    public get isPurchased(): boolean {
        return this._completed;
    }

    public get paidAmount(): number {
        return this._paidAmount;
    }

    public get remainingAmount(): number {
        return Math.max(0, this.costAmount - this._paidAmount);
    }

    /** 配置固定工人生成点与朝向（优先于 workerSpawnPosition 网格排布） */
    public setWorkerSpawnPositions(positions: Vec3[], lookAtTarget?: Vec3): void {
        this._workerSpawnPositions.length = 0;
        for (const pos of positions) {
            this._workerSpawnPositions.push(pos.clone());
        }
        if (lookAtTarget) {
            this._workerLookAtTarget.set(lookAtTarget);
        }
    }

    /** 激活购买区（用于解锁链：前置完成后显示） */
    public activate(): void {
        if (this._completed) {
            return;
        }
        this.resnapWorldPosition();
        if (!this.node.active) {
            this.node.active = true;
        }
        this._scheduleResnapRetries();
    }

    /** 写入世界锚点并立即贴地 */
    public applyWorldAnchor(worldPosition: Vec3, island?: Node | null): void {
        this.anchorWorldPosition.set(worldPosition);
        this._resnapToIsland(island);
    }

    /** 按锚点 XZ 重新贴地（与榨汁机投料区相同逻辑） */
    public resnapWorldPosition(): void {
        this._resnapToIsland();
    }

    private _resnapToIsland(island?: Node | null): void {
        const islandNode = island ?? this.node.parent ?? GameSceneRefs.island;
        const anchor = this._resolveAnchorWorldPosition();
        const snapped = IslandSurfaceSampler.snapWorldPositionToSurface(
            anchor,
            islandNode,
            0,
        );
        this.node.setWorldPosition(snapped);
    }

    private _resolveAnchorWorldPosition(): Vec3 {
        if (this.anchorWorldPosition.lengthSqr() >= 1e-6) {
            return this.anchorWorldPosition.clone();
        }
        const wp = this.node.worldPosition;
        return new Vec3(wp.x, 0, wp.z);
    }

    private _scheduleResnapRetries(): void {
        const delays = [0.15, 0.35, 0.7];
        for (const delay of delays) {
            this.scheduleOnce(() => {
                if (!this.isValid || this._completed) {
                    return;
                }
                this.resnapWorldPosition();
            }, delay);
        }
    }

    // ─── private ─────────────────────────────────────────────────────────

    private _getSubjectId(): string {
        return this.orderSubjectId || this.node.name;
    }

    private _registerOrder(): void {
        OrderManager.ensure().createOrder({
            subjectId: this._getSubjectId(),
            subjectType: OrderSubjectType.Counter,
            requirements: [{ type: this.costType, amount: this.costAmount }],
            subjectNode: null, // 世界 UI 已展示需求，不显示头顶气泡
            displayName: this.displayName,
        });
        this._syncOrder();
    }

    private _depositWhileStanding(dt: number): void {
        const remaining = this.remainingAmount;
        if (remaining <= 0) {
            return;
        }

        const wallet = CurrencyWallet.instance ?? CurrencyWallet.ensure();
        const balance = wallet.getBalance(this.costType);
        if (balance <= 0) {
            return;
        }

        const deposit = Math.min(
            remaining,
            balance,
            Math.max(1, Math.floor(this.depositPerSecond * dt)),
        );
        if (!wallet.spend(this.costType, deposit)) {
            return;
        }

        this._paidAmount += deposit;
        this._refreshUI();

        if (this._paidAmount >= this.costAmount) {
            this._complete();
        }
    }

    private _complete(): void {
        if (this._completed) {
            return;
        }
        this._completed = true;
        this._paidAmount = this.costAmount;

        this._view?.setProgress(1);
        AudioController.ensure().play(SoundEffect.Upgrade);
        this._view?.setCompleted(() => {
            this.scheduleOnce(() => {
                if (this._padNode?.isValid) {
                    this._padNode.destroy();
                }
                this.node.active = false;
                this.node.emit('purchase-zone-ui-closed', this.unlockTarget);
            }, 0.5);
        });
        OrderManager.instance?.completeOrder(this._getSubjectId());

        if (this.unlockTarget?.isValid) {
            this.unlockTarget.active = true;
        }

        if (this.grantWorkerCount > 0) {
            const workers = WorkerGrant.spawnAtPositions(
                this.grantWorkerCount,
                this.grantWorkerVariant,
                this._workerSpawnPositions.length > 0
                    ? this._workerSpawnPositions
                    : [this.workerSpawnPosition],
                this._workerLookAtTarget,
                RewardManager.ensure().workerPrefab,
                this.grantStaffRole,
            );
            RewardManager.ensure().registerWorkers(workers);
        }

        this.node.emit('purchase-zone-unlocked', this.unlockTarget);
        GuideManager.instance?.notify(GuideConditionType.UnlockPurchaseZone, {
            subjectId: this._getSubjectId(),
        });
    }

    private _refreshUI(): void {
        const remaining = this.remainingAmount;
        const ratio = this.costAmount > 0 ? this._paidAmount / this.costAmount : 1;
        this._view?.setAmount(remaining);
        this._view?.setProgress(ratio);
        this._syncOrder();
        this._updateAffordable();
    }

    private _syncOrder(): void {
        const remaining = this.remainingAmount;
        OrderManager.instance?.syncRequirements(
            this._getSubjectId(),
            remaining > 0 ? [{ type: this.costType, amount: remaining }] : [],
        );
    }

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
        const ui = instantiate(prefab);
        const finish = () => this._mountUI(ui);
        if (this.rewardIconPath) {
            this._swapRewardIcon(ui, finish);
            return;
        }
        finish();
    }

    private _swapRewardIcon(uiRoot: Node, onDone: () => void): void {
        const rewardNode = uiRoot.getChildByPath('Content/Reward');
        const sprite = rewardNode?.getComponent(Sprite);
        if (!sprite) {
            onDone();
            return;
        }
        resources.load(`${this.rewardIconPath}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (!err && frame && sprite.isValid) {
                sprite.spriteFrame = frame;
            }
            onDone();
        });
    }

    private _mountUI(uiRoot: Node): void {
        const pad = new Node('PurchasePad');
        pad.setParent(this.node);
        pad.setPosition(0, this.planeYOffset, 0);
        pad.layer = Layers.Enum.DEFAULT;
        this._padNode = pad;

        const viewNode = new Node('PurchaseZoneView');
        viewNode.setParent(pad);
        viewNode.setPosition(Vec3.ZERO);
        viewNode.layer = Layers.Enum.DEFAULT;

        const view = viewNode.addComponent(PurchaseZoneView);
        view.dimWhenUnaffordable = this.dimWhenUnaffordable;

        view.setup(uiRoot, this.uiScale);

        this._view = view;
        this._refreshUI();
        this.resnapWorldPosition();
        this._scheduleResnapRetries();
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
        this.playerNode = GameSceneRefs.protagonist;
        return this.playerNode;
    }

    private _updateAffordable(): void {
        if (!this.dimWhenUnaffordable || !this._view) {
            return;
        }
        const wallet = CurrencyWallet.instance;
        const affordable = wallet?.canAfford(this.costType, 1) ?? false;
        this._view.setAffordable(affordable);
    }
}
