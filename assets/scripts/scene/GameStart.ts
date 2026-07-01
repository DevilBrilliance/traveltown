import {
    _decorator,
    Component,
    director,
    Node,
    Prefab,
    Vec3,
} from 'cc';
import { CurrencyType } from '../currency/CurrencyType';
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

const { ccclass, property } = _decorator;

/**
 * 游戏开始入口：启动时在指定位置创建主角（NPC_RIG / nv2）。
 * 请在编辑器中手动挂到场景节点（如 Main 或场景根下的 Game 节点）。
 */
@ccclass('GameStart')
export class GameStart extends Component {
    @property({ tooltip: '进入场景后自动开始游戏' })
    autoStart = true;

    @property({ tooltip: '主角世界坐标生成位置' })
    spawnPosition = new Vec3(0, 0, 0);

    @property({ type: Prefab, tooltip: '可选：拖入 resources/characters/NPC_RIG，加载失败时用此引用' })
    protagonistPrefab: Prefab | null = null;

   

    private _protagonist: Node | null = null;
    private _customersSpawned = false;

    onLoad() {
        this._ensureCurrencyWallet();
        this._ensureCurrencyDisplay();
        this._ensureOrderManager();
        this._ensureRewardManager();
        this._ensureSpeechBubbleSystem();
        this._ensureFenceBoundary();
        this._ensureDrawCallOptimizer();
        this._spawnMoneyPickups();
        this.scheduleOnce(() => this._bindCashRegisterUnlock(), 0);
        if (this.autoStart) {
            this.startGame();
        }
    }

    onDestroy() {
        const island = director.getScene()?.getChildByName('Island');
        const zoneNode = island?.getChildByName('CounterPurchaseZone');
        zoneNode?.off('purchase-zone-ui-closed', this._onPurchaseZoneUiClosed, this);
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
                characterNode.addComponent(PlayerMovementController);
                const orbit = CameraOrbitController.bindMainCamera(characterNode, true);
                bindCameraTouchUI(orbit);
                this._protagonist = characterNode;
            },
            this.protagonistPrefab,
        );
    }

    private _bindCashRegisterUnlock(): void {
        const island = director.getScene()?.getChildByName('Island');
        const zoneNode = island?.getChildByName('CounterPurchaseZone');
        zoneNode?.on('purchase-zone-ui-closed', this._onPurchaseZoneUiClosed, this);

        const purchaseZone = zoneNode?.getComponent(PurchaseZone);
        if (purchaseZone?.isPurchased) {
            this._onPurchaseZoneUiClosed();
        }
    }

    private _onPurchaseZoneUiClosed(): void {
        if (this._customersSpawned) {
            return;
        }
        this._customersSpawned = true;
        this._spawnCustomers();
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
                requirements: [{ type: CurrencyType.PineappleJuice, amount: 3 }],
                subjectId: 'Customer_0',
                displayName: '顾客',
            },
            {
                position: new Vec3(-12, 0, -3),
                appearance: CharacterAppearanceType.Customer1,
                requirements: [{ type: CurrencyType.PineappleJuice, amount: 5 }],
                subjectId: 'Customer_1',
                displayName: '顾客',
            },
        ]);
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
        const island = director.getScene()?.getChildByName('Island');
        if (island) {
            return island;
        }
        // Scene 根节点不能挂组件，角色统一挂在 start 下
        return this.node;
    }

    private _ensureFenceBoundary(): PlayAreaBoundary | null {
        const island = director.getScene()?.getChildByName('Island');
        if (!island) {
            console.warn('[GameStart] 未找到 Island，无法创建栅栏碰撞');
            return null;
        }
        const boundary = island.getComponent(PlayAreaBoundary) ?? island.addComponent(PlayAreaBoundary);
        boundary.rebuild();
        return boundary;
    }

    private _ensureDrawCallOptimizer(): PlayableDrawCallOptimizer | null {
        const island = director.getScene()?.getChildByName('Island');
        if (!island) {
            return null;
        }
        return island.getComponent(PlayableDrawCallOptimizer)
            ?? island.addComponent(PlayableDrawCallOptimizer);
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
