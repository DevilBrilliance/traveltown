import {
    _decorator,
    assetManager,
    Component,
    director,
    geometry,
    instantiate,
    MeshRenderer,
    Node,
    Prefab,
    Vec3,
} from 'cc';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { CharacterAnimState } from '../character/CharacterAnimState';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { CurrencyType } from '../currency/CurrencyType';
import { OrderManager } from '../order/OrderManager';
import {
    findDeliverableCustomerJuiceOrder,
} from '../order/CustomerOrderHelper';
import { GameSceneRefs } from '../scene/GameSceneRefs';
import { GuideManager } from '../guide/GuideManager';
import { GuideConditionType } from '../guide/GuideTypes';
import { JuiceMachine } from './JuiceMachine';
import { JUICE_TRAY_DB_PATH, JUICE_TRAY_PREFAB_UUID } from './JuiceMachinePaths';
import { JuiceRackBounds } from './JuiceRackBounds';
import {
    COUNTER_DELIVERY_RADIUS,
} from './CounterDeliveryHelper';

const { ccclass, property } = _decorator;

@ccclass('PlayerJuiceTrayCarrier')
export class PlayerJuiceTrayCarrier extends Component {
    @property({ type: JuiceMachine, tooltip: '榨汁机，不填则自动查找 JuiceMachineZone' })
    juiceMachine: JuiceMachine | null = null;

    @property({ type: Node, tooltip: '果汁架节点（ZhaLan_Box），不填则自动查找' })
    juiceRack: Node | null = null;

    @property({ type: Prefab, tooltip: '手持托盘预制体（可拖 ZhaLan_Box），不填则按 UUID 加载' })
    trayPrefabRef: Prefab | null = null;

    @property({ tooltip: '大托盘 AABB 前后左右外扩距离（世界单位）' })
    pickupMargin = 2;

    @property({ tooltip: '玩家最多端走的果汁杯数' })
    maxCarryCount = 12;

    @property({ tooltip: '每取一杯间隔（秒）' })
    transferInterval = 0.5;

    @property({ tooltip: '收银台每交付一杯间隔（秒）' })
    deliverInterval = 0.5;

    @property({ tooltip: '托盘挂点（玩家本地坐标，同后背菠萝挂法）' })
    trayLocalPos = new Vec3(0, 1.35, 0.75);

    @property({ tooltip: '托盘挂点本地欧拉角' })
    trayLocalEuler = new Vec3(0, 0, 0);

    @property({ tooltip: '托盘模型本地缩放' })
    trayLocalScale = 0.2;

    @property({ tooltip: '托盘上果汁杯本地缩放' })
    glassLocalScale = 2;

    @property({ tooltip: '托盘格子首角（本地坐标，覆盖整盘可摆放区域）' })
    trayGridStart = new Vec3(-16, -1.5, 11.5);

    @property({ tooltip: '托盘格子末角（本地坐标，覆盖整盘可摆放区域）' })
    trayGridEnd = new Vec3(-21.11, -1.5, 15);

    @property({ tooltip: '手持托盘 X 方向列数（3×4=12，勿与场景架 6×4=24 混用）' })
    trayColsX = 3;

    @property({ tooltip: '手持托盘 Z 方向行数（先 Z 后 X）' })
    trayRowsZ = 4;

    @property({ tooltip: 'ZuoZi 交付范围外扩距离（世界单位）' })
    counterRadius = COUNTER_DELIVERY_RADIUS;

    @property({ tooltip: '每杯果汁交付获得金币' })
    coinPerGlass = 20;

    private _trayMount: Node | null = null;
    private _trayModel: Node | null = null;
    private _glassRoot: Node | null = null;
    private _trayPrefab: Prefab | null = null;
    private _trayLoading = false;
    private _trayVisible = false;
    private _inPickupZone = false;
    private _carriedCount = 0;
    private _transferTimer = 0;
    private _deliverTimer = 0;
    private _rackAabbReady = false;

    private readonly _glassLocalPos = new Vec3();
    private readonly _rackAabb = new geometry.AABB();

    public get carriedJuiceCount(): number {
        return this._carriedCount;
    }

    public get isTrayActive(): boolean {
        return this._inPickupZone || this._carriedCount > 0;
    }

    public get isInPickupZone(): boolean {
        return this._inPickupZone;
    }

    /** 当前是否在果汁架拾取范围内（供服务员 AI 判定） */
    public isInRackPickupRange(): boolean {
        const machine = this._resolveJuiceMachine();
        const rack = this._resolveRack(machine);
        if (!rack?.isValid) {
            return false;
        }
        return this._isInsideRackPickupZone(rack);
    }

    /** 当前是否在任一待交付顾客对应的 ZuoZi 范围内 */
    public isActorNearCounter(): boolean {
        return this._isNearCounter();
    }

    public bindJuiceMachine(machine: JuiceMachine | null): void {
        this.juiceMachine = machine;
        if (machine?.outputRack?.isValid) {
            this.juiceRack = machine.outputRack;
            this._rackAabbReady = false;
        }
    }

    /** 从 GameSceneRefs 同步场景引用（GameStart 绑定后调用） */
    public bindFromSceneRefs(): void {
        if (GameSceneRefs.juiceOutputRack?.isValid) {
            this.juiceRack = GameSceneRefs.juiceOutputRack;
            this._rackAabbReady = false;
        }
        if (GameSceneRefs.juiceMachine?.isValid) {
            this.bindJuiceMachine(GameSceneRefs.juiceMachine);
        }
    }

    public setTrayPrefab(prefab: Prefab | null): void {
        if (!prefab) {
            return;
        }
        this.trayPrefabRef = prefab;
        this._trayPrefab = prefab;
        if (this._trayVisible && this._trayMount?.isValid && !this._trayModel?.isValid) {
            this._attachTrayModel(prefab);
        }
    }

    public getLocomotionAnimState(moving: boolean): CharacterAnimState | null {
        if (!this.isTrayActive) {
            return null;
        }
        return moving ? CharacterAnimState.PlateRun : CharacterAnimState.PlateIdle;
    }

    start() {
        this.bindFromSceneRefs();
        this._resolveJuiceMachine();
        this._resolveRack(this.juiceMachine);
        if (this.trayPrefabRef) {
            this._trayPrefab = this.trayPrefabRef;
        }
        this._preloadTrayPrefab();
    }

    update(dt: number) {
        const machine = this._resolveJuiceMachine();
        const rack = this._resolveRack(machine);
        if (!rack?.isValid) {
            this._hideTray();
            return;
        }

        const sceneCount = this._countSceneGlasses(rack, machine);
        const inRange = this._isInsideRackPickupZone(rack);
        const hasJuice = sceneCount > 0;
        const shouldPickup = inRange && hasJuice;

        const wasInZone = this._inPickupZone;
        this._inPickupZone = shouldPickup;
        if (wasInZone !== this._inPickupZone) {
            this.node.emit('juice-tray-changed', this._carriedCount);
        }

        if (this._carriedCount > 0 && this._isNearCounter()) {
            this._handleCounterDelivery(dt);
            if (this._carriedCount > 0) {
                this._updateTrayMount();
                this._ensureTray();
                return;
            }
            this._endTrayStateIfEmpty();
        }

        const shouldShowTray = this._carriedCount > 0 || shouldPickup;
        if (!shouldShowTray) {
            this._hideTray();
            this._transferTimer = 0;
            return;
        }

        this._updateTrayMount();
        this._ensureTray();

        if (shouldPickup && this._carriedCount < this.maxCarryCount) {
            this._transferTimer += dt;
            while (
                this._transferTimer >= this.transferInterval
                && this._countSceneGlasses(rack, machine) > 0
                && this._carriedCount < this.maxCarryCount
            ) {
                this._transferTimer -= this.transferInterval;
                this._transferOneGlass(machine, rack);
            }
        } else if (!shouldPickup) {
            this._transferTimer = 0;
        }
    }

    private _preloadTrayPrefab(): void {
        if (this._trayPrefab || this._trayLoading) {
            return;
        }
        this._trayLoading = true;

        const onLoaded = (prefab: Prefab | null) => {
            this._trayLoading = false;
            if (!prefab || !this.isValid) {
                return;
            }
            this._trayPrefab = prefab;
            if (this._trayVisible && this._trayMount?.isValid && !this._trayModel?.isValid) {
                this._attachTrayModel(prefab);
            }
        };

        if (this.trayPrefabRef) {
            onLoaded(this.trayPrefabRef);
            return;
        }

        assetManager.loadAny({ uuid: JUICE_TRAY_PREFAB_UUID }, (err, asset) => {
            if (!err && asset) {
                onLoaded(asset as Prefab);
                return;
            }
            assetManager.loadAny({ path: JUICE_TRAY_DB_PATH, type: Prefab }, (err2, asset2) => {
                if (err2 || !asset2) {
                    console.warn('[PlayerJuiceTrayCarrier] 托盘模型加载失败', err ?? err2);
                    onLoaded(null);
                    return;
                }
                onLoaded(asset2 as Prefab);
            });
        });
    }

    /** 与 PlayerFruitCarrier 相同：挂点建在玩家根节点下，每帧同步本地偏移 */
    private _ensureTrayRoot(): void {
        if (this._trayMount?.isValid) {
            return;
        }

        let root = this.node.getChildByName('JuiceTrayMount');
        if (!root) {
            root = new Node('JuiceTrayMount');
            root.setParent(this.node, false);
            root.layer = this.node.layer;
            root.active = false;
        }
        this._trayMount = root;
        this._glassRoot = null;
    }

    private _updateTrayMount(): void {
        this._ensureTrayRoot();
        const mount = this._trayMount;
        if (!mount?.isValid) {
            return;
        }
        mount.setPosition(this.trayLocalPos);
        mount.setRotationFromEuler(this.trayLocalEuler);
        mount.setScale(this.trayLocalScale, this.trayLocalScale, this.trayLocalScale);
    }

    private _ensureTray(): void {
        this._ensureTrayRoot();
        const mount = this._trayMount;
        if (!mount?.isValid) {
            return;
        }

        const wasVisible = this._trayVisible;
        mount.active = true;
        this._trayVisible = true;
        if (!wasVisible) {
            this.node.emit('juice-tray-changed', this._carriedCount);
        }

        if (this._trayModel?.isValid) {
            this._ensureGlassRootOnTrayModel();
            return;
        }

        if (this._trayPrefab) {
            this._attachTrayModel(this._trayPrefab);
            return;
        }

        this._preloadTrayPrefab();
    }

    private _attachTrayModel(prefab: Prefab): void {
        if (!this._trayMount?.isValid || this._trayModel?.isValid) {
            return;
        }
        const model = instantiate(prefab);
        model.name = 'JuiceTrayModel';
        model.setParent(this._trayMount);
        model.setPosition(Vec3.ZERO);
        model.setRotationFromEuler(0, 0, 0);
        model.setScale(1, 1, 1);
        this._finalizeTrayModel(model);
        this._trayModel = model;
        this._ensureGlassRootOnTrayModel();
    }

    /** 果汁杯挂在托盘模型下，格子坐标相对 ZhaLan_Box 本地空间 */
    private _ensureGlassRootOnTrayModel(): void {
        const model = this._trayModel;
        if (!model?.isValid) {
            return;
        }
        if (!this._glassRoot?.isValid) {
            this._glassRoot = new Node('JuiceTrayGlasses');
        }
        if (this._glassRoot.parent !== model) {
            this._glassRoot.setParent(model);
        }
        this._glassRoot.setPosition(Vec3.ZERO);
        this._glassRoot.setRotationFromEuler(0, 0, 0);
        this._glassRoot.setScale(1, 1, 1);
    }

    private _finalizeTrayModel(model: Node): void {
        const layer = this.node.layer;
        const renderers = model.getComponentsInChildren(MeshRenderer);
        if (renderers.length === 0) {
            console.warn('[PlayerJuiceTrayCarrier] 托盘预制体无 MeshRenderer');
            return;
        }

        for (const renderer of renderers) {
            renderer.node.layer = layer;
            renderer.enabled = true;
        }
    }

    private _hideTray(): void {
        if (this._trayMount?.isValid) {
            this._trayMount.active = false;
        }
        const wasVisible = this._trayVisible;
        this._trayVisible = false;
        this._transferTimer = 0;
        this._deliverTimer = 0;
        if (wasVisible) {
            this.node.emit('juice-tray-changed', this._carriedCount);
        }
    }

    private _endTrayStateIfEmpty(): void {
        if (this._carriedCount > 0) {
            return;
        }
        this._hideTray();
        if (!this._inPickupZone) {
            this.node.emit('juice-tray-changed', 0);
        }
    }

    private _isNearCounter(): boolean {
        const pp = this.node.worldPosition;
        return findDeliverableCustomerJuiceOrder(pp.x, pp.z, this.counterRadius) !== null;
    }

    private _findDeliverableOrder() {
        const pp = this.node.worldPosition;
        return findDeliverableCustomerJuiceOrder(pp.x, pp.z, this.counterRadius);
    }

    private _handleCounterDelivery(dt: number): void {
        const order = this._findDeliverableOrder();
        if (!order) {
            this._deliverTimer = 0;
            return;
        }

        this._deliverTimer += dt;
        while (
            this._deliverTimer >= this.deliverInterval
            && this._carriedCount > 0
        ) {
            const juiceReq = order.requirements.find((r) => r.type === CurrencyType.PineappleJuice);
            if (!juiceReq || juiceReq.amount <= 0) {
                break;
            }
            if (!this._removeOneCarriedGlass()) {
                break;
            }

            CurrencyWallet.ensure().add(CurrencyType.GoldCoin, this.coinPerGlass);
            AudioController.ensure().play(SoundEffect.CollectCoin);

            const nextReqs = order.requirements
                .map((r) => (
                    r.type === CurrencyType.PineappleJuice
                        ? { type: r.type, amount: r.amount - 1 }
                        : { type: r.type, amount: r.amount }
                ))
                .filter((r) => r.amount > 0);

            const manager = OrderManager.ensure();
            manager.syncRequirements(order.subjectId, nextReqs);
            if (nextReqs.length === 0) {
                manager.completeOrder(order.subjectId);
            }

            this._deliverTimer -= this.deliverInterval;
            this.node.emit('juice-tray-changed', this._carriedCount);
            GuideManager.instance?.notify(GuideConditionType.DeliverJuice, { amount: 1 });
        }
    }

    private _removeOneCarriedGlass(): boolean {
        if (!this._glassRoot?.isValid || this._carriedCount <= 0) {
            return false;
        }

        let best: Node | null = null;
        let bestIdx = -1;
        for (const child of this._glassRoot.children) {
            const match = /^JuiceGlass_(\d+)$/.exec(child.name);
            const idx = match ? parseInt(match[1], 10) : 0;
            if (idx > bestIdx) {
                bestIdx = idx;
                best = child;
            }
        }
        if (!best && this._glassRoot.children.length > 0) {
            best = this._glassRoot.children[this._glassRoot.children.length - 1];
        }
        if (!best?.isValid) {
            return false;
        }

        best.destroy();
        this._carriedCount = Math.max(0, this._carriedCount - 1);
        return true;
    }

    private _countSceneGlasses(rack: Node, machine: JuiceMachine | null): number {
        const root = rack.getChildByName('JuiceGlassRoot');
        if (root?.isValid && root.children.length > 0) {
            return root.children.length;
        }

        let deepCount = 0;
        const stack: Node[] = [rack];
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (/^JuiceGlass_\d+$/.test(current.name)) {
                deepCount += 1;
            }
            for (const child of current.children) {
                stack.push(child);
            }
        }
        if (deepCount > 0) {
            return deepCount;
        }

        return machine?.glassCount ?? machine?.sceneGlassCount ?? 0;
    }

    private _resolveJuiceMachine(): JuiceMachine | null {
        if (this.juiceMachine?.isValid) {
            return this.juiceMachine;
        }
        this.juiceMachine = GameSceneRefs.juiceMachine;
        return this.juiceMachine;
    }

    private _resolveRack(machine: JuiceMachine | null): Node | null {
        if (this.juiceRack?.isValid) {
            return this.juiceRack;
        }
        if (machine?.outputRack?.isValid) {
            this.juiceRack = machine.outputRack;
            this._rackAabbReady = false;
            return this.juiceRack;
        }
        if (GameSceneRefs.juiceOutputRack?.isValid) {
            this.juiceRack = GameSceneRefs.juiceOutputRack;
            this._rackAabbReady = false;
            return this.juiceRack;
        }
        return null;
    }

    private _ensureRackAabb(rack: Node): boolean {
        if (this._rackAabbReady) {
            return true;
        }
        if (!JuiceRackBounds.readNodeWorldAabb(rack, this._rackAabb)) {
            return false;
        }
        this._rackAabbReady = true;
        return true;
    }

    private _isInsideRackPickupZone(rack: Node): boolean {
        if (!this._ensureRackAabb(rack)) {
            const pp = this.node.worldPosition;
            const rp = rack.worldPosition;
            const dx = pp.x - rp.x;
            const dz = pp.z - rp.z;
            const m = this.pickupMargin;
            return dx * dx + dz * dz <= m * m;
        }

        const pp = this.node.worldPosition;
        return JuiceRackBounds.isPointInsideXZExpanded(
            this._rackAabb,
            pp.x,
            pp.z,
            this.pickupMargin,
        );
    }

    private _transferOneGlass(machine: JuiceMachine | null, rack: Node): void {
        const glass = machine?.takeOneSceneGlass() ?? this._takeOneGlassFromRack(rack);
        if (!glass?.isValid) {
            return;
        }

        this._ensureTray();
        this._ensureGlassRootOnTrayModel();
        if (!this._glassRoot?.isValid) {
            glass.setParent(rack.getChildByName('JuiceGlassRoot') ?? rack);
            return;
        }

        const index = this._carriedCount;
        this._computeTrayGlassLocal(index, this._glassLocalPos);

        glass.setParent(this._glassRoot);
        glass.setPosition(this._glassLocalPos);
        glass.setRotationFromEuler(0, 0, 0);
        glass.setScale(this.glassLocalScale, this.glassLocalScale, this.glassLocalScale);

        this._carriedCount++;
        this.node.emit('juice-tray-changed', this._carriedCount);
        GuideManager.instance?.notify(GuideConditionType.CollectJuice, { amount: 1 });
    }

    private _takeOneGlassFromRack(rack: Node): Node | null {
        const root = rack.getChildByName('JuiceGlassRoot');
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
        return glass;
    }

    private _computeTrayGlassLocal(index: number, out: Vec3): void {
        const cols = this.trayColsX;
        const rows = this.trayRowsZ;
        const col = Math.floor(index / rows);
        const row = index % rows;
        const colT = cols > 1 ? col / (cols - 1) : 0;
        const rowT = rows > 1 ? row / (rows - 1) : 0;

        out.x = this.trayGridStart.x + (this.trayGridEnd.x - this.trayGridStart.x) * colT;
        out.y = this.trayGridStart.y + (this.trayGridEnd.y - this.trayGridStart.y) * rowT;
        out.z = this.trayGridStart.z + (this.trayGridEnd.z - this.trayGridStart.z) * rowT;
    }
}
