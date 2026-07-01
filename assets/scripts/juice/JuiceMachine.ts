import {
    _decorator,
    assetManager,
    Component,
    director,
    instantiate,
    Layers,
    Node,
    Prefab,
    resources,
    Sprite,
    SpriteFrame,
    Vec3,
} from 'cc';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { PlayerFruitCarrier } from '../fruit/PlayerFruitCarrier';
import { IslandSurfaceSampler } from '../scene/IslandSurfaceSampler';
import { PurchaseZoneView } from '../purchase/PurchaseZoneView';
import { PURCHASE_ZONE_UI_PREFAB_PATH } from '../purchase/PurchaseZonePaths';
import { JuiceMachineAnimator } from './JuiceMachineAnimator';
import { JuiceRackBounds } from './JuiceRackBounds';
import {
    JUICE_GLASS_PREFAB_UUID,
    JUICE_MACHINE_PINEAPPLE_ICON_PATH,
} from './JuiceMachinePaths';

function findChildDeep(root: Node, name: string): Node | null {
    if (root.name === name) {
        return root;
    }
    for (const child of root.children) {
        const found = findChildDeep(child, name);
        if (found) {
            return found;
        }
    }
    return null;
}

const { ccclass, property } = _decorator;

/**
 * 榨汁机：玩家投菠萝（最多 24），UI 常驻；有料时运行并每 1 秒产一杯汁到 ZhaLan_Box。
 */
@ccclass('JuiceMachine')
export class JuiceMachine extends Component {
    @property({ tooltip: '机器内菠萝容量' })
    bufferCapacity = 24;

    @property({ tooltip: '栅栏区最多放置杯数' })
    maxGlassCount = 24;

    @property({ tooltip: '产出间隔（秒）' })
    produceInterval = 1;

    @property({ type: Node, tooltip: '果汁杯摆放父节点（ZhaLan_Box）' })
    outputRack: Node | null = null;

    @property({ type: Node, tooltip: '机器参考点（用于运行动画，默认 JiQi_RIG）' })
    machineRef: Node | null = null;

    @property({ tooltip: '贴地 Y 偏移（在底板顶面之上）' })
    planeYOffset = 0.05;

    @property({ tooltip: 'UI 像素 → 世界单位缩放' })
    uiScale = new Vec3(0.006, 0.006, 0.006);

    @property({ tooltip: '投料区（JuiceMachineZone）AABB 外扩距离' })
    zoneTriggerMargin = 2.5;

    @property({ tooltip: '机器模型（JiQi）AABB 外扩距离' })
    machineTriggerMargin = 1;

    @property({ tooltip: '投料速度（个/秒）' })
    depositPerSecond = 8;

    @property({ tooltip: '首角本地坐标（相对 JuiceGlassRoot，第 1 列第 1 行）' })
    rackStartLocal = new Vec3(-7.123, -0.78, 5.292);

    @property({ tooltip: '末角本地坐标（相对 JuiceGlassRoot，最后一列最后一行）' })
    rackEndLocal = new Vec3(-12.023, -0.78, 8.512);

    @property({ tooltip: 'X 方向列数' })
    rackColsX = 6;

    @property({ tooltip: 'Z 方向行数（先沿 Z 排满一行再换列）' })
    rackRowsZ = 4;

    @property({ type: Node, tooltip: '玩家节点，不填则查找 Protagonist' })
    playerNode: Node | null = null;

    private _activated = false;
    private _storedPineapples = 0;
    private _glassCount = 0;
    private _produceTimer = 0;
    private _view: PurchaseZoneView | null = null;
    private _padNode: Node | null = null;
    private _animator: JuiceMachineAnimator | null = null;
    private _glassPrefab: Prefab | null = null;
    private _glassRoot: Node | null = null;

    private readonly _glassPos = new Vec3();

    onLoad() {
        if (!this.machineRef) {
            const island = director.getScene()?.getChildByName('Island');
            if (island) {
                this.machineRef = findChildDeep(island, 'JiQi_RIG');
            }
        }
    }

    start() {
        this._resolvePlayer();
        if (this._activated) {
            this._ensureRuntimeReady();
            this._refreshUI();
        }
    }

    update(dt: number) {
        if (!this._activated) {
            return;
        }
        this._tryDeposit(dt);
        this._updateProduction(dt);
    }

    public get isActivated(): boolean {
        return this._activated;
    }

    public get storedPineapples(): number {
        return this._storedPineapples;
    }

    public get glassCount(): number {
        return this._glassCount;
    }

    /** 场景栅栏区当前果汁杯数量 */
    public get sceneGlassCount(): number {
        this._ensureGlassRoot();
        return this._glassRoot?.children.length ?? 0;
    }

    /** 从栅栏区取走最早的一杯（供玩家托盘拾取） */
    public takeOneSceneGlass(): Node | null {
        this._ensureGlassRoot();
        const root = this._glassRoot;
        if (!root?.isValid || root.children.length === 0) {
            return null;
        }
        let best: Node | null = null;
        let bestIdx = Infinity;
        for (const child of root.children) {
            const match = /^JuiceGlass_(\d+)$/.exec(child.name);
            const idx = match ? parseInt(match[1], 10) : 0;
            if (idx < bestIdx) {
                bestIdx = idx;
                best = child;
            }
        }
        const glass = best ?? root.children[0];
        glass.setParent(null);
        this._glassCount = Math.max(0, this._glassCount - 1);
        return glass;
    }

    public get canDeposit(): boolean {
        return this._storedPineapples < this.bufferCapacity;
    }

    /** 角色是否在投料范围内（玩家/工人） */
    public isActorInDepositRange(actor: Node): boolean {
        return this._isActorInDepositRange(actor);
    }

    /** 获取投料区世界参考点 */
    public getDepositWorldPosition(out: Vec3): Vec3 {
        this.node.getWorldPosition(out);
        return out;
    }

    /**
     * 从背篓向机器投菠萝（工人/玩家共用）
     * @returns 本帧实际投入数量
     */
    public depositFromCarrier(
        carrier: { pineappleCount: number; removeOnePineapple(): boolean },
        dt: number,
    ): number {
        if (!this.canDeposit || carrier.pineappleCount <= 0) {
            return 0;
        }

        const room = this.bufferCapacity - this._storedPineapples;
        const maxThisFrame = Math.max(1, Math.floor(this.depositPerSecond * dt));
        const count = Math.min(room, carrier.pineappleCount, maxThisFrame);
        let deposited = 0;

        for (let i = 0; i < count; i += 1) {
            if (!carrier.removeOnePineapple()) {
                break;
            }
            this._storedPineapples++;
            deposited += 1;
        }

        if (deposited > 0) {
            this._refreshUI();
        }
        return deposited;
    }

    public get isProducing(): boolean {
        return this._storedPineapples > 0 && this._glassCount < this.maxGlassCount;
    }

    /** 收银台解锁后显示投料区与世界 UI */
    public activate(): void {
        if (this._activated) {
            return;
        }
        this._activated = true;
        this._snapToFloorSurface();
        this.node.active = true;
        this._resolveAnimator();
        this._ensureGlassRoot();
        if (!this._glassPrefab) {
            this._loadGlassPrefab();
        }
        // 等场景底板 Mesh 世界包围盒就绪后再创建 UI
        this.scheduleOnce(() => {
            if (!this.isValid || !this._activated) {
                return;
            }
            this._ensureRuntimeReady();
            this._refreshUI();
        }, 0.15);
    }

    private _snapToFloorSurface(): void {
        const island = director.getScene()?.getChildByName('Island');
        const pos = this.node.worldPosition.clone();
        IslandSurfaceSampler.snapWorldPositionToSurface(pos, island, 0, pos);
        this.node.setWorldPosition(pos);
    }

    private _ensureRuntimeReady(): void {
        this._resolveAnimator();
        this._ensureGlassRoot();
        if (!this._glassPrefab) {
            this._loadGlassPrefab();
        }
        if (!this._view) {
            this._spawnUI();
        }
    }

    private _resolveAnimator(): void {
        const ref = this.machineRef;
        if (!ref?.isValid) {
            return;
        }
        if (!ref.active) {
            ref.active = true;
        }
        this._animator = ref.getComponent(JuiceMachineAnimator)
            ?? ref.addComponent(JuiceMachineAnimator);
    }

    // ─── deposit & production ────────────────────────────────────────────

    private _tryDeposit(dt: number): void {
        if (!this.canDeposit) {
            return;
        }
        const player = this._resolvePlayer();
        if (!player || !this._isPlayerInRange(player)) {
            return;
        }
        const carrier = player.getComponent(PlayerFruitCarrier);
        if (!carrier || carrier.pineappleCount <= 0) {
            return;
        }

        this.depositFromCarrier(carrier, dt);
    }

    private _updateProduction(dt: number): void {
        if (!this._animator && this.machineRef?.isValid) {
            this._resolveAnimator();
        }

        const shouldRun = this.isProducing;
        this._animator?.setRunning(shouldRun);

        if (!shouldRun) {
            this._produceTimer = 0;
            return;
        }

        this._produceTimer += dt;
        while (this._produceTimer >= this.produceInterval && this.isProducing) {
            this._produceTimer -= this.produceInterval;
            this._spawnGlass();
            this._storedPineapples--;
            this._refreshUI();
        }
    }

    private _spawnGlass(): void {
        if (!this._glassPrefab || !this._glassRoot?.isValid) {
            return;
        }

        const index = this._glassCount;
        this._computeGlassLocalPosition(index, this._glassPos);

        const glass = instantiate(this._glassPrefab);
        glass.name = `JuiceGlass_${index}`;
        glass.setParent(this._glassRoot);
        glass.setPosition(this._glassPos);

        AudioController.ensure().play(SoundEffect.PourJuice);

        this._glassCount++;
    }

    /** 6×4 棋盘：先沿 Z 递增排 rackRowsZ 杯，再 X 换列（相对 JuiceGlassRoot 本地坐标） */
    private _computeGlassLocalPosition(index: number, out: Vec3): void {
        const col = Math.floor(index / this.rackRowsZ);
        const row = index % this.rackRowsZ;
        const colT = this.rackColsX > 1 ? col / (this.rackColsX - 1) : 0;
        const rowT = this.rackRowsZ > 1 ? row / (this.rackRowsZ - 1) : 0;

        out.x = this.rackStartLocal.x + (this.rackEndLocal.x - this.rackStartLocal.x) * colT;
        out.y = this.rackStartLocal.y + (this.rackEndLocal.y - this.rackStartLocal.y) * rowT;
        out.z = this.rackStartLocal.z + (this.rackEndLocal.z - this.rackStartLocal.z) * rowT;
    }

    // ─── UI ──────────────────────────────────────────────────────────────

    private _refreshUI(): void {
        const remaining = Math.max(0, this.bufferCapacity - this._storedPineapples);
        const ratio = this.bufferCapacity > 0 ? this._storedPineapples / this.bufferCapacity : 0;
        this._view?.setAmount(remaining);
        this._view?.setProgress(ratio);
    }

    private _spawnUI(): void {
        if (this._view || this._padNode?.isValid) {
            return;
        }
        resources.load(PURCHASE_ZONE_UI_PREFAB_PATH, Prefab, (err, prefab) => {
            if (err || !prefab || !this.isValid || !this._activated) {
                if (err) {
                    console.warn('[JuiceMachine] 加载 PurchaseZoneUI 失败', err);
                }
                return;
            }
            this._buildUI(prefab);
        });
    }

    private _buildUI(prefab: Prefab): void {
        const ui = instantiate(prefab);
        const coin = ui.getChildByPath('Content/Coin');
        coin?.destroy();

        const rewardNode = ui.getChildByPath('Content/Reward');
        const sprite = rewardNode?.getComponent(Sprite);
        const finish = () => this._mountUI(ui);

        if (!sprite) {
            finish();
            return;
        }
        resources.load(`${JUICE_MACHINE_PINEAPPLE_ICON_PATH}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (!err && frame && sprite.isValid) {
                sprite.spriteFrame = frame;
            }
            finish();
        });
    }

    private _mountUI(uiRoot: Node): void {
        if (this._padNode?.isValid) {
            uiRoot.destroy();
            return;
        }

        const pad = new Node('JuiceMachinePad');
        pad.setParent(this.node);
        pad.setPosition(0, this.planeYOffset, 0);
        pad.layer = Layers.Enum.DEFAULT;
        pad.active = true;
        this._padNode = pad;

        const viewNode = new Node('JuiceMachineView');
        viewNode.setParent(pad);
        viewNode.setPosition(Vec3.ZERO);
        viewNode.layer = Layers.Enum.DEFAULT;

        const view = viewNode.addComponent(PurchaseZoneView);
        view.setup(uiRoot, this.uiScale, ['Coin']);
        this._view = view;
        this._refreshUI();
    }

    // ─── helpers ─────────────────────────────────────────────────────────

    private _ensureGlassRoot(): void {
        if (!this.outputRack?.isValid) {
            return;
        }
        let root = this.outputRack.getChildByName('JuiceGlassRoot');
        if (!root) {
            root = new Node('JuiceGlassRoot');
            root.setParent(this.outputRack);
            root.setPosition(0, 0, 0);
        }
        this._glassRoot = root;
    }

    private _loadGlassPrefab(): void {
        assetManager.loadAny({ uuid: JUICE_GLASS_PREFAB_UUID, type: Prefab }, (err, asset) => {
            if (err || !asset) {
                console.warn('[JuiceMachine] 加载 Glass 预制体失败', err);
                return;
            }
            this._glassPrefab = asset as Prefab;
        });
    }

    private _isActorInDepositRange(actor: Node): boolean {
        const pp = actor.worldPosition;
        if (JuiceRackBounds.isPointNearNode(this.node, pp.x, pp.z, this.zoneTriggerMargin)) {
            return true;
        }
        const ref = this.machineRef;
        if (ref?.isValid) {
            return JuiceRackBounds.isPointNearNode(
                ref,
                pp.x,
                pp.z,
                this.machineTriggerMargin,
                true,
            );
        }
        return false;
    }

    private _isPlayerInRange(player: Node): boolean {
        return this._isActorInDepositRange(player);
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
}
