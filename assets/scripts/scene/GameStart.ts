import {
    _decorator,
    Component,
    director,
    Node,
    Prefab,
    Vec3,
} from 'cc';
import { rollCustomerJuiceRequirement } from '../order/CustomerOrderHelper';
import { AppearanceController } from '../character/AppearanceController';
import { CharacterAppearanceType } from '../character/CharacterAppearanceType';
import { PlayerMovementController } from '../character/PlayerMovementController';
import { CameraOrbitController } from '../camera/CameraOrbitController';
import { bindCameraTouchUI } from '../camera/CameraTouchUISetup';
import { PlayAreaBoundary } from './PlayAreaBoundary';
import { PlayableDrawCallOptimizer } from './PlayableDrawCallOptimizer';
import { CurrencyDisplay } from '../currency/CurrencyDisplay';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { OrderManager } from '../order/OrderManager';
import { RewardManager } from '../reward/RewardManager';
import { SpeechBubbleManager } from '../ui/bubble/SpeechBubbleManager';
import { OrderBubbleBinder } from '../ui/bubble/OrderBubbleBinder';
import { SpeechBubbleTestInput } from '../ui/bubble/SpeechBubbleTestInput';
import { CustomerSpawner } from '../character/CustomerSpawner';
import { MoneyPickupSpawner } from '../pickup/MoneyPickupSpawner';
import { PurchaseZone } from '../purchase/PurchaseZone';
import { ensurePurchaseZone } from '../purchase/PurchaseZoneSetup';
import {
    PURCHASE_LAND_EXPANSION_ICON_PATH,
    PURCHASE_REWARD_ICON_PATH,
    PURCHASE_WAITER_REWARD_ICON_PATH,
    PURCHASE_WORKER_REWARD_ICON_PATH,
} from '../purchase/PurchaseZonePaths';
import {
    PINEAPPLE_FIELD_LOOK_AT,
    WORKER_PURCHASE_POSITION,
    WORKER_SPAWN_POSITIONS,
} from '../purchase/WorkerPurchaseConfig';
import { WorkerRewardVariant, StaffRole } from '../reward/RewardType';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { FruitCollectFieldSetup } from '../fruit/FruitCollectFieldSetup';
import { PlayerFruitCarrier } from '../fruit/PlayerFruitCarrier';
import { PlayerJuiceTrayCarrier } from '../juice/PlayerJuiceTrayCarrier';
import { JuiceMachine } from '../juice/JuiceMachine';
import { JuiceMachineSetup } from '../juice/JuiceMachineSetup';
import { GameSceneRefs } from './GameSceneRefs';
import { GuideManager } from '../guide/GuideManager';
import { GuideConditionType } from '../guide/GuideTypes';
import { FruitType } from '../fruit/FruitType';

const { ccclass, property } = _decorator;

/**
 * 游戏开始入口：挂到场景 `start` 节点，进入场景后自动初始化并创建主角。
 * 场景节点请在 Inspector 直接绑定，避免运行时按名查找。
 */
@ccclass('GameStart')
export class GameStart extends Component {
    private static _instance: GameStart | null = null;

    public static get instance(): GameStart | null {
        return GameStart._instance;
    }

    @property({ tooltip: '进入场景后自动开始游戏' })
    autoStart = true;

    @property({ type: Node, tooltip: 'Island 根节点' })
    island: Node | null = null;

    @property({ type: Node, tooltip: '收银台果汁交付点 ZuoZi' })
    counterDeliveryNode: Node | null = null;

    @property({ type: Node, tooltip: '场景果汁架 ZhaLan_Box' })
    juiceOutputRack: Node | null = null;

    @property({ type: Node, tooltip: '榨汁机模型 JiQi_RIG' })
    juiceMachineRig: Node | null = null;

    @property({ type: Node, tooltip: '收银台解锁购买区 CounterPurchaseZone' })
    counterPurchaseZone: Node | null = null;

    @property({ tooltip: '主角世界坐标生成位置' })
    spawnPosition = new Vec3(0, 0, 0);

    @property({ type: Prefab, tooltip: '可选：拖入 resources/characters/NPC_RIG，加载失败时用此引用' })
    protagonistPrefab: Prefab | null = null;

    @property({ tooltip: '解锁工人购买区世界坐标' })
    workerPurchasePosition = new Vec3(26, 0, 3.5);

    @property({ tooltip: '解锁服务员购买区世界坐标' })
    cashierPurchasePosition = new Vec3(2, 0, -4);

    @property({ tooltip: '服务员解锁后生成位置（收银台旁）' })
    cashierSpawnPosition = new Vec3(-3, 0, 5);

    @property({ type: Node, tooltip: '收银台二解锁目标（SYJ）' })
    counter2UnlockTarget: Node | null = null;

    @property({ type: Node, tooltip: '收银台二果汁交付点 ZuoZi-001' })
    counter2DeliveryNode: Node | null = null;

    @property({ type: Node, tooltip: '橘子田根节点 juzi' })
    juziField: Node | null = null;

    @property({ tooltip: '收银台二解锁购买区世界坐标' })
    counter2PurchasePosition = new Vec3(34, 0, 2);

    @property({ tooltip: '扩地购买区世界坐标' })
    landExpansionPosition = new Vec3(27, 0, 6.5);

    @property({ tooltip: '榨汁机投料区世界坐标（Y 会按底板顶面自动抬高）' })
    juiceMachinePosition = new Vec3(26, 0, -10);

    private _protagonist: Node | null = null;
    private _customersSpawned = false;
    private _counter2CustomersSpawned = false;
    private _workerPurchaseZone: PurchaseZone | null = null;
    private _cashierPurchaseZone: PurchaseZone | null = null;
    private _counter2PurchaseZone: PurchaseZone | null = null;
    private _landExpansionZone: PurchaseZone | null = null;
    private _juiceMachine: JuiceMachine | null = null;

    onLoad() {
        GameStart._instance = this;
        this._publishSceneRefs();
        AudioController.ensure();
        this._ensureCurrencyWallet();
        this._ensureCurrencyDisplay();
        this._ensureOrderManager();
        this._ensureRewardManager();
        this._ensureSpeechBubbleSystem();
        this._ensureFenceBoundary();
        this._ensureDrawCallOptimizer();
        this._resolveLateGameSceneNodes();
        this._hideJuziChildren();
        this._ensureFruitCollectFields();
        GuideManager.ensure();
        this.scheduleOnce(() => this._bindUnlockChain(), 0);
        if (this.autoStart) {
            this.startGame();
        }
    }

    onDestroy() {
        if (GameStart._instance === this) {
            GameStart._instance = null;
        }
        this.counterPurchaseZone?.off('purchase-zone-ui-closed', this._onCashRegisterUnlocked, this);
        this._workerPurchaseZone?.node.off('purchase-zone-ui-closed', this._onWorkerUnlocked, this);
        this._cashierPurchaseZone?.node.off('purchase-zone-ui-closed', this._onWaiterUnlocked, this);
        this._counter2PurchaseZone?.node.off('purchase-zone-ui-closed', this._onCounter2Unlocked, this);
        this._landExpansionZone?.node.off('purchase-zone-ui-closed', this._onLandExpansionUnlocked, this);
    }

    /** 开始游戏并创建主角 */
    public startGame(): void {
        if (this._protagonist?.isValid) {
            return;
        }

        const parent = this._getSpawnParent();
        AppearanceController.create(
            parent,
            CharacterAppearanceType.Protagonist,
            (_controller, characterNode) => {
                characterNode.name = 'Protagonist';
                characterNode.setWorldPosition(this.spawnPosition);
                characterNode.addComponent(PlayerFruitCarrier);
                const juiceTray = characterNode.addComponent(PlayerJuiceTrayCarrier);
                characterNode.addComponent(PlayerMovementController);
                juiceTray.bindJuiceMachine(this._juiceMachine);
                juiceTray.bindFromSceneRefs();
                const orbit = CameraOrbitController.bindMainCamera(characterNode, true);
                bindCameraTouchUI(orbit);
                this._protagonist = characterNode;
                GameSceneRefs.protagonist = characterNode;
                this._bindProtagonistGuide(characterNode);
                this._onProtagonistReady();
            },
            this.protagonistPrefab,
        );
    }

    private _bindUnlockChain(): void {
        const island = this.island;
        if (!island) {
            console.warn('[GameStart] 请在 Inspector 绑定 island');
            return;
        }

        this._setupWorkerAndCashierZones(island);
        this._setupLateGameZones(island);
        this._juiceMachine = JuiceMachineSetup.ensureOnIsland(
            island,
            this.juiceMachinePosition,
            this.juiceMachineRig,
            this.juiceOutputRack,
        );
        GameSceneRefs.juiceMachine = this._juiceMachine;
        this._publishSceneRefs();
        this._protagonist?.getComponent(PlayerJuiceTrayCarrier)?.bindJuiceMachine(this._juiceMachine);

        this.counterPurchaseZone?.on('purchase-zone-ui-closed', this._onCashRegisterUnlocked, this);

        const counterPurchase = this.counterPurchaseZone?.getComponent(PurchaseZone);
        if (counterPurchase?.isPurchased) {
            this._onCashRegisterUnlocked();
        }
    }

    private _setupWorkerAndCashierZones(island: Node): void {
        this._workerPurchaseZone = ensurePurchaseZone(
            island,
            'WorkerPurchaseZone',
            WORKER_PURCHASE_POSITION.clone(),
            {
                costAmount: 100,
                displayName: '工人',
                orderSubjectId: 'Unlock_Workers',
                rewardIconPath: PURCHASE_WORKER_REWARD_ICON_PATH,
                grantWorkerCount: 3,
                grantWorkerVariant: WorkerRewardVariant.WorkerNan2,
                workerSpawnPositions: WORKER_SPAWN_POSITIONS,
                workerLookAtTarget: PINEAPPLE_FIELD_LOOK_AT,
            },
        );
        this._workerPurchaseZone.node.on('purchase-zone-ui-closed', this._onWorkerUnlocked, this);

        this._cashierPurchaseZone = ensurePurchaseZone(
            island,
            'CashierPurchaseZone',
            this.cashierPurchasePosition,
            {
                costAmount: 50,
                displayName: '服务员',
                orderSubjectId: 'Unlock_Cashier',
                rewardIconPath: PURCHASE_WAITER_REWARD_ICON_PATH,
                grantWorkerCount: 1,
                grantWorkerVariant: WorkerRewardVariant.WorkerNv1,
                grantStaffRole: StaffRole.Waiter,
                workerSpawnPosition: this.cashierSpawnPosition,
            },
        );
        this._cashierPurchaseZone.node.on('purchase-zone-ui-closed', this._onWaiterUnlocked, this);

        if (this._workerPurchaseZone.isPurchased) {
            this._onWorkerUnlocked();
        }
        if (this._cashierPurchaseZone.isPurchased) {
            this._onWaiterUnlocked();
        }

        this._publishGuideSceneRefs();
    }

    private _setupLateGameZones(island: Node): void {
        this._counter2PurchaseZone = ensurePurchaseZone(
            island,
            'Counter2PurchaseZone',
            this.counter2PurchasePosition,
            {
                costAmount: 100,
                displayName: '收银台二',
                orderSubjectId: 'Unlock_Counter2',
                rewardIconPath: PURCHASE_REWARD_ICON_PATH,
                unlockTarget: this.counter2UnlockTarget,
            },
        );
        this._counter2PurchaseZone.node.on('purchase-zone-ui-closed', this._onCounter2Unlocked, this);

        this._landExpansionZone = ensurePurchaseZone(
            island,
            'LandExpansionPurchaseZone',
            this.landExpansionPosition,
            {
                costAmount: 200,
                displayName: '扩地',
                orderSubjectId: 'Unlock_LandExpansion',
                rewardIconPath: PURCHASE_LAND_EXPANSION_ICON_PATH,
            },
        );
        this._landExpansionZone.node.on('purchase-zone-ui-closed', this._onLandExpansionUnlocked, this);

        if (this._counter2PurchaseZone.isPurchased) {
            this._onCounter2Unlocked();
        }
        if (this._landExpansionZone.isPurchased) {
            this._onLandExpansionUnlocked();
        }
    }

    private _resolveLateGameSceneNodes(): void {
        const island = this.island;
        if (!island) {
            return;
        }
        if (!this.juziField?.isValid) {
            this.juziField = island.getChildByName('juzi');
        }
        if (!this.counter2DeliveryNode?.isValid) {
            this.counter2DeliveryNode = this._findDescendantByName(island, 'ZuoZi-001');
        }
        if (!this.counter2UnlockTarget?.isValid && this.counter2DeliveryNode?.isValid) {
            this.counter2UnlockTarget = this.counter2DeliveryNode.getChildByName('SYJ')
                ?? this._findDescendantByName(this.counter2DeliveryNode, 'SYJ');
        }
    }

    private _findDescendantByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const child of root.children) {
            const found = this._findDescendantByName(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private _hideJuziChildren(): void {
        const juzi = this.juziField;
        if (!juzi?.isValid) {
            return;
        }
        for (const child of juzi.children) {
            child.active = false;
        }
    }

    private _publishGuideSceneRefs(): void {
        GameSceneRefs.workerPurchaseZone = this._workerPurchaseZone?.node ?? null;
        GameSceneRefs.cashierPurchaseZone = this._cashierPurchaseZone?.node ?? null;
        GameSceneRefs.counter2PurchaseZone = this._counter2PurchaseZone?.node ?? null;
        GameSceneRefs.landExpansionPurchaseZone = this._landExpansionZone?.node ?? null;
        GameSceneRefs.juziField = this.juziField;
        if (this.island?.isValid) {
            GameSceneRefs.pineappleField = this.island.getChildByName('pineapple');
        }
    }

    private _onCashRegisterUnlocked(): void {
        if (!this._customersSpawned) {
            this._customersSpawned = true;
            this._spawnCustomers();
        }
        this._workerPurchaseZone?.activate();
        this._juiceMachine?.activate();
        this._protagonist?.getComponent(PlayerJuiceTrayCarrier)?.bindJuiceMachine(this._juiceMachine);
        this._protagonist?.getComponent(PlayerJuiceTrayCarrier)?.bindFromSceneRefs();
    }

    private _onWorkerUnlocked(): void {
        this._cashierPurchaseZone?.activate();
    }

    private _onWaiterUnlocked(): void {
        this._counter2PurchaseZone?.activate();
    }

    private _onCounter2Unlocked(): void {
        GameSceneRefs.counter2DeliveryNode = this.counter2DeliveryNode;
        if (!this._counter2CustomersSpawned) {
            this._counter2CustomersSpawned = true;
            this._spawnCounter2Customers();
        }
        this._landExpansionZone?.activate();
        this._protagonist?.getComponent(PlayerJuiceTrayCarrier)?.bindFromSceneRefs();
    }

    private _onLandExpansionUnlocked(): void {
        this._showJuziField();
    }

    private _showJuziField(): void {
        const juzi = this.juziField;
        if (!juzi?.isValid) {
            return;
        }
        for (const child of juzi.children) {
            child.active = true;
        }
        juzi.getComponent(FruitCollectFieldSetup)?.apply();
        GameSceneRefs.juziField = juzi;
    }

    private _spawnCustomers(): void {
        let spawner = this.node.getComponent(CustomerSpawner);
        if (!spawner) {
            spawner = this.node.addComponent(CustomerSpawner);
        }
        spawner.npcPrefab = this.protagonistPrefab;
        spawner.lookAtTarget.set(0, 0, 0);
        spawner.spawnFromConfigs([
            {
                position: new Vec3(-12, 0, 3),
                appearance: CharacterAppearanceType.Customer0,
                requirements: [rollCustomerJuiceRequirement()],
                subjectId: 'Customer_0',
                displayName: '顾客',
            },
            {
                position: new Vec3(-12, 0, -3),
                appearance: CharacterAppearanceType.Customer1,
                requirements: [rollCustomerJuiceRequirement()],
                subjectId: 'Customer_1',
                displayName: '顾客',
            },
        ]);
    }

    private _spawnCounter2Customers(): void {
        let spawner = this.node.getComponent(CustomerSpawner);
        if (!spawner) {
            spawner = this.node.addComponent(CustomerSpawner);
        }
        spawner.npcPrefab = this.protagonistPrefab;
        spawner.lookAtTarget.set(0, 0, 0);
        spawner.appendFromConfigs([
            {
                position: new Vec3(10, 0, 22),
                appearance: CharacterAppearanceType.Customer0,
                requirements: [rollCustomerJuiceRequirement()],
                subjectId: 'Customer_2',
                displayName: '顾客',
            },
            {
                position: new Vec3(13, 0, 22),
                appearance: CharacterAppearanceType.Customer1,
                requirements: [rollCustomerJuiceRequirement()],
                subjectId: 'Customer_3',
                displayName: '顾客',
            },
        ]);
    }

    private _onProtagonistReady(): void {
        AudioController.ensure().playBgm(SoundEffect.BgmHappyWaves);
        this._spawnMoneyPickups();
        this.scheduleOnce(() => {
            const spawner = this.node.getComponent(MoneyPickupSpawner);
            GameSceneRefs.firstMoneyPickup = spawner?.getFirstCoin() ?? GameSceneRefs.firstMoneyPickup;
            GuideManager.ensure().begin();
        }, 0.35);
    }

    private _bindProtagonistGuide(protagonist: Node): void {
        protagonist.on('fruit-collected', (fruitType: FruitType) => {
            if (fruitType === FruitType.Pineapple) {
                GuideManager.instance?.notify(GuideConditionType.CollectPineapple, { amount: 1 });
            }
        });
    }

    private _spawnMoneyPickups(): void {
        let spawner = this.node.getComponent(MoneyPickupSpawner);
        if (!spawner) {
            spawner = this.node.addComponent(MoneyPickupSpawner);
        }
        spawner.center.set(6, 0, 0);
        spawner.radius = 5;
        spawner.count = 5;
        spawner.spawnPickups();
    }

    public get protagonist(): Node | null {
        return this._protagonist;
    }

    private _getSpawnParent(): Node {
        if (this.island?.isValid) {
            return this.island;
        }
        // Scene 根节点不能挂组件，角色统一挂在 start 下
        return this.node;
    }

    private _publishSceneRefs(): void {
        GameSceneRefs.island = this.island;
        GameSceneRefs.counterDeliveryNode = this.counterDeliveryNode;
        GameSceneRefs.juiceOutputRack = this.juiceOutputRack;
        GameSceneRefs.juiceMachineRig = this.juiceMachineRig;
        GameSceneRefs.counterPurchaseZone = this.counterPurchaseZone;
        GameSceneRefs.juziField = this.juziField;
        GameSceneRefs.juiceMachine = this._juiceMachine;
        GameSceneRefs.protagonist = this._protagonist;
        this._publishGuideSceneRefs();

        if (!this.counterDeliveryNode) {
            console.warn('[GameStart] 请在 Inspector 绑定 counterDeliveryNode (ZuoZi)');
        }
        if (!this.juiceOutputRack) {
            console.warn('[GameStart] 请在 Inspector 绑定 juiceOutputRack (ZhaLan_Box)');
        }
        if (!this.juiceMachineRig) {
            console.warn('[GameStart] 请在 Inspector 绑定 juiceMachineRig (JiQi_RIG)');
        }
    }

    private _ensureFenceBoundary(): PlayAreaBoundary | null {
        const island = this.island;
        if (!island) {
            console.warn('[GameStart] 未找到 Island，无法创建栅栏碰撞');
            return null;
        }
        const boundary = island.getComponent(PlayAreaBoundary) ?? island.addComponent(PlayAreaBoundary);
        boundary.rebuild();
        return boundary;
    }

    private _ensureDrawCallOptimizer(): PlayableDrawCallOptimizer | null {
        const island = this.island;
        if (!island) {
            return null;
        }
        return island.getComponent(PlayableDrawCallOptimizer)
            ?? island.addComponent(PlayableDrawCallOptimizer);
    }

    private _ensureFruitCollectFields(): void {
        FruitCollectFieldSetup.ensureOnIsland(this.island);
    }

    private _ensureCurrencyWallet(): CurrencyWallet {
        return CurrencyWallet.ensure();
    }

    private _ensureCurrencyDisplay(): CurrencyDisplay | null {
        const canvas = director.getScene()?.getChildByName('mainCanvas');
        if (!canvas) {
            return null;
        }
        return canvas.getComponent(CurrencyDisplay) ?? canvas.addComponent(CurrencyDisplay);
    }

    private _ensureOrderManager(): OrderManager {
        return OrderManager.ensure();
    }

    private _ensureRewardManager(): RewardManager {
        return RewardManager.ensure();
    }

    private _ensureSpeechBubbleSystem(): SpeechBubbleManager {
        const bubbles = SpeechBubbleManager.ensure();
        const startNode = director.getScene()?.getChildByName('start') ?? this.node;
        if (!startNode.getComponent(OrderBubbleBinder)) {
            startNode.addComponent(OrderBubbleBinder);
        }
        if (!startNode.getComponent(SpeechBubbleTestInput)) {
            startNode.addComponent(SpeechBubbleTestInput);
        }
        return bubbles;
    }
}
