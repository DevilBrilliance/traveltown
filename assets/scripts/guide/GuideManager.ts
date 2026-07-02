import {
    _decorator,
    Component,
    director,
    Node,
    Vec3,
} from 'cc';
import { GameSceneRefs } from '../scene/GameSceneRefs';
import { GuideArrow } from './GuideArrow';
import { DEFAULT_GUIDE_TASKS } from './GuideTaskConfig';
import {
    GuideCondition,
    GuideConditionType,
    GuideDynamicTarget,
    GuideNotifyPayload,
    GuideSceneRefKey,
    GuideTargetConfig,
    GuideTargetKind,
    GuideTaskConfig,
} from './GuideTypes';

const { ccclass, property } = _decorator;

@ccclass('GuideManager')
export class GuideManager extends Component {
    private static _instance: GuideManager | null = null;

    public static get instance(): GuideManager | null {
        return GuideManager._instance;
    }

    public static ensure(): GuideManager {
        if (GuideManager._instance?.isValid) {
            return GuideManager._instance;
        }
        const scene = director.getScene();
        const host = scene?.getChildByName('start') ?? scene;
        if (!host) {
            throw new Error('[GuideManager] 未找到场景根节点');
        }
        return host.getComponent(GuideManager) ?? host.addComponent(GuideManager);
    }

    @property({ tooltip: '启用新手引导' })
    enabledGuide = true;

    @property({ tooltip: '首个引导任务 id，不填则用配置表第一项' })
    entryTaskId = 'guide_01_collect_money';

    private readonly _taskMap = new Map<string, GuideTaskConfig>();
    private readonly _completed = new Set<string>();
    private readonly _activeTasks = new Map<string, number[]>();
    private _arrow: GuideArrow | null = null;
    private _arrowRoot: Node | null = null;
    private _configs: GuideTaskConfig[] = DEFAULT_GUIDE_TASKS;
    private _started = false;

    onLoad(): void {
        if (GuideManager._instance && GuideManager._instance !== this) {
            this.destroy();
            return;
        }
        GuideManager._instance = this;
        this._buildTaskMap(this._configs);
        this._ensureArrow();
    }

    onDestroy(): void {
        if (GuideManager._instance === this) {
            GuideManager._instance = null;
        }
    }

    /** 注入引导配置（默认已加载 DEFAULT_GUIDE_TASKS） */
    public setTaskConfigs(configs: GuideTaskConfig[]): void {
        this._configs = configs;
        this._buildTaskMap(configs);
    }

    /** 开始引导（等场景与金币就绪后调用） */
    public begin(entryTaskId?: string): void {
        if (!this.enabledGuide || this._started) {
            return;
        }
        this._started = true;
        const id = entryTaskId || this.entryTaskId || this._configs[0]?.id;
        if (id) {
            this._activateTask(id);
        }
    }

    /** 外部系统上报引导进度 */
    public notify(type: GuideConditionType, payload: GuideNotifyPayload = {}): void {
        if (!this.enabledGuide || this._activeTasks.size === 0) {
            return;
        }

        const completedIds: string[] = [];
        for (const [taskId, progress] of this._activeTasks) {
            const config = this._taskMap.get(taskId);
            if (!config) {
                continue;
            }

            for (let i = 0; i < config.conditions.length; i += 1) {
                const cond = config.conditions[i];
                if (cond.type !== type) {
                    continue;
                }
                if (!this._matchCondition(cond, payload)) {
                    continue;
                }
                const need = cond.amount ?? 1;
                progress[i] = Math.min(need, (progress[i] ?? 0) + (payload.amount ?? 1));
            }

            let allDone = true;
            for (let i = 0; i < config.conditions.length; i += 1) {
                if (!this._isConditionSatisfied(config.conditions[i], progress[i] ?? 0)) {
                    allDone = false;
                    break;
                }
            }
            if (allDone) {
                completedIds.push(taskId);
            }
        }

        for (const taskId of completedIds) {
            this._completeTask(taskId);
        }
        this._refreshArrowTarget();
    }

    private _buildTaskMap(configs: GuideTaskConfig[]): void {
        this._taskMap.clear();
        for (const config of configs) {
            this._taskMap.set(config.id, config);
        }
    }

    private _activateTask(taskId: string): void {
        if (this._completed.has(taskId) || this._activeTasks.has(taskId)) {
            return;
        }
        const config = this._taskMap.get(taskId);
        if (!config) {
            console.warn(`[GuideManager] 未找到引导任务: ${taskId}`);
            return;
        }
        this._activeTasks.set(taskId, new Array(config.conditions.length).fill(0));
        this._refreshArrowTarget();
    }

    private _completeTask(taskId: string): void {
        const config = this._taskMap.get(taskId);
        if (!config) {
            return;
        }
        this._activeTasks.delete(taskId);
        this._completed.add(taskId);

        for (const nextId of config.nextTaskIds) {
            this._activateTask(nextId);
        }

        if (this._activeTasks.size === 0) {
            this._arrow?.clearTarget();
        } else {
            this._refreshArrowTarget();
        }
    }

    private _refreshArrowTarget(): void {
        const task = this._getPrimaryActiveTask();
        if (!task) {
            this._arrow?.clearTarget();
            return;
        }

        const target = task.target;
        if (target.fixedWorldPosition) {
            this._arrow?.setFixedPose(
                target.fixedWorldPosition,
                target.fixedWorldEuler ?? Vec3.ZERO,
            );
            return;
        }

        const offset = target.worldOffset ?? new Vec3(0, 2, 0);
        const targetNode = this._resolveTargetNode(target);
        this._arrow?.setTarget(targetNode, offset);
    }

    private _getPrimaryActiveTask(): GuideTaskConfig | null {
        const firstId = this._activeTasks.keys().next().value as string | undefined;
        if (!firstId) {
            return null;
        }
        return this._taskMap.get(firstId) ?? null;
    }

    private _resolveTargetNode(target: GuideTargetConfig): Node | null {
        switch (target.kind) {
            case GuideTargetKind.Node:
                return target.node?.isValid ? target.node : null;
            case GuideTargetKind.SceneRef:
                return this._resolveSceneRefNode(target.sceneRefKey);
            case GuideTargetKind.Dynamic:
                return this._resolveDynamicTarget(target.dynamicKey);
            default:
                return null;
        }
    }

    private _resolveSceneRefNode(key?: GuideSceneRefKey): Node | null {
        switch (key) {
            case 'counterPurchaseZone':
                return GameSceneRefs.counterPurchaseZone;
            case 'juiceOutputRack':
                return GameSceneRefs.juiceOutputRack;
            case 'counterDeliveryNode':
                return GameSceneRefs.counterDeliveryNode;
            case 'workerPurchaseZone':
                return GameSceneRefs.workerPurchaseZone;
            case 'cashierPurchaseZone':
                return GameSceneRefs.cashierPurchaseZone;
            case 'counter2PurchaseZone':
                return GameSceneRefs.counter2PurchaseZone;
            case 'landExpansionPurchaseZone':
                return GameSceneRefs.landExpansionPurchaseZone;
            case 'pineappleField':
                return GameSceneRefs.pineappleField;
            case 'juiceMachineZone':
                return GameSceneRefs.juiceMachine?.node ?? null;
            default:
                return null;
        }
    }

    private _resolveDynamicTarget(key?: GuideDynamicTarget): Node | null {
        switch (key) {
            case GuideDynamicTarget.FirstMoney:
                return GameSceneRefs.firstMoneyPickup;
            case GuideDynamicTarget.PineappleField:
                return GameSceneRefs.pineappleField;
            case GuideDynamicTarget.FirstPineapple:
                return GameSceneRefs.pineappleField;
            default:
                return null;
        }
    }

    private _matchCondition(cond: GuideCondition, payload: GuideNotifyPayload): boolean {
        if (cond.type === GuideConditionType.UnlockPurchaseZone) {
            if (!cond.subjectId || !payload.subjectId) {
                return false;
            }
            return cond.subjectId === payload.subjectId;
        }
        return true;
    }

    private _isConditionSatisfied(cond: GuideCondition, progress: number): boolean {
        return progress >= (cond.amount ?? 1);
    }

    private _ensureArrow(): void {
        if (this._arrowRoot?.isValid) {
            return;
        }
        const parent = GameSceneRefs.island ?? this.node;
        this._arrowRoot = new Node('GuideArrowRoot');
        this._arrowRoot.setParent(parent);
        this._arrow = this._arrowRoot.addComponent(GuideArrow);
        this._arrowRoot.active = true;
    }
}
