import {
    _decorator,
    assetManager,
    Component,
    director,
    instantiate,
    math,
    Node,
    Prefab,
    Quat,
    resources,
    Vec3,
} from 'cc';
import { AppearanceController } from '../character/AppearanceController';
import {
    CharacterAppearanceType,
    NPC_RIG_PREFAB_PATH,
    NPC_RIG_PREFAB_UUID,
} from '../character/CharacterAppearanceType';
import { CharacterAnimController } from '../character/CharacterAnimController';
import { getDefaultAnimForAppearance } from '../character/CharacterAnimState';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { CurrencyType } from '../currency/CurrencyType';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { IslandSurfaceSampler } from '../scene/IslandSurfaceSampler';
import {
    RewardGrantSpec,
    RewardItem,
    toRewardGrantSpecs,
} from './RewardItem';
import { RewardGrantResult, RewardListener } from './RewardResult';
import {
    REWARD_TYPE_LABELS,
    RewardType,
    WorkerRewardVariant,
    WORKER_VARIANT_LABELS,
} from './RewardType';

const { ccclass, property } = _decorator;

const WORKER_APPEARANCE: Record<WorkerRewardVariant, CharacterAppearanceType> = {
    [WorkerRewardVariant.WorkerNan2]: CharacterAppearanceType.WorkerNan2,
    [WorkerRewardVariant.WorkerNv1]: CharacterAppearanceType.WorkerNv1,
};

/**
 * 全局奖励系统：发放工人、菠萝汁、普通金币。
 */
@ccclass('RewardManager')
export class RewardManager extends Component {
    private static _instance: RewardManager | null = null;

    public static get instance(): RewardManager | null {
        return RewardManager._instance;
    }

    public static ensure(): RewardManager {
        if (RewardManager._instance) {
            return RewardManager._instance;
        }
        const node = new Node('RewardManager');
        director.getScene()?.addChild(node);
        return node.addComponent(RewardManager)!;
    }

    @property({ type: Prefab, tooltip: '工人 NPC 预制体，不填则自动加载 NPC_RIG' })
    workerPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: '工人生成父节点，不填则 Island/Workers' })
    workerParent: Node | null = null;

    @property({ tooltip: '工人生成基准位置（世界坐标）' })
    workerSpawnBase = new Vec3(22, 0, -6);

    @property({ tooltip: '多个工人之间的间距' })
    workerSpawnSpacing = 1.8;

    private readonly _workers = new Set<Node>();
    private readonly _listeners = new Set<RewardListener>();
    private _npcPrefab: Prefab | null = null;
    private _workerSeq = 0;

    onLoad() {
        if (RewardManager._instance && RewardManager._instance !== this) {
            this.node.destroy();
            return;
        }
        RewardManager._instance = this;
        director.addPersistRootNode(this.node);
        this._preloadWorkerPrefab();
    }

    onDestroy() {
        if (RewardManager._instance === this) {
            RewardManager._instance = null;
        }
    }

    public onRewardGranted(listener: RewardListener): void {
        this._listeners.add(listener);
    }

    public offRewardGranted(listener: RewardListener): void {
        this._listeners.delete(listener);
    }

    /** 当前已生成的工人数量 */
    public get workerCount(): number {
        this._purgeInvalidWorkers();
        return this._workers.size;
    }

    /** 获取已生成的工人节点 */
    public getWorkers(): Node[] {
        this._purgeInvalidWorkers();
        return [...this._workers];
    }

    /**
     * 批量发放奖励
     */
    public grant(items: RewardItem[] | RewardGrantSpec[]): RewardGrantResult {
        const specs = items.length > 0 && 'rewardType' in items[0]
            ? toRewardGrantSpecs(items as RewardItem[])
            : items as RewardGrantSpec[];

        const result: RewardGrantResult = {
            success: true,
            granted: [],
            spawnedWorkers: [],
        };

        for (const spec of specs) {
            if (spec.amount <= 0) {
                continue;
            }
            const partial = this._grantOne(spec);
            if (!partial.ok) {
                result.success = false;
                continue;
            }
            result.granted.push({ ...spec });
            if (partial.workers.length > 0) {
                result.spawnedWorkers.push(...partial.workers);
            }
        }

        if (result.granted.length > 0) {
            this._notify(result);
        }

        return result;
    }

    /** 发放菠萝汁 */
    public grantPineappleJuice(amount: number): boolean {
        return this.grant([{ type: RewardType.PineappleJuice, amount }]).success;
    }

    /** 发放普通金币 */
    public grantGoldCoin(amount: number): boolean {
        return this.grant([{ type: RewardType.GoldCoin, amount }]).success;
    }

    /** 发放工人 */
    public grantWorker(
        count: number,
        variant: WorkerRewardVariant = WorkerRewardVariant.WorkerNan2,
        spawnBase?: Vec3,
    ): Node[] {
        const base = spawnBase ?? this.workerSpawnBase;
        const partial = this._grantWorkers(count, variant, base);
        const result: RewardGrantResult = {
            success: partial.ok,
            granted: partial.ok ? [{ type: RewardType.Worker, amount: count, workerVariant: variant }] : [],
            spawnedWorkers: partial.workers,
        };
        if (result.granted.length > 0) {
            this._notify(result);
        }
        return partial.workers;
    }

    /** 在指定世界坐标生成工人，并可统一朝向目标点 */
    public grantWorkersAt(
        count: number,
        variant: WorkerRewardVariant = WorkerRewardVariant.WorkerNan2,
        positions: readonly Vec3[],
        lookAtTarget?: Vec3,
    ): Node[] {
        const partial = this._grantWorkersAt(count, variant, positions, lookAtTarget);
        const result: RewardGrantResult = {
            success: partial.ok,
            granted: partial.ok ? [{ type: RewardType.Worker, amount: count, workerVariant: variant }] : [],
            spawnedWorkers: partial.workers,
        };
        if (result.granted.length > 0) {
            this._notify(result);
        }
        return partial.workers;
    }

    /** 奖励描述 */
    public formatRewards(specs: RewardGrantSpec[]): string {
        return specs.map((s) => {
            if (s.type === RewardType.Worker) {
                const label = WORKER_VARIANT_LABELS[s.workerVariant ?? WorkerRewardVariant.WorkerNan2];
                return `${label}×${s.amount}`;
            }
            return `${REWARD_TYPE_LABELS[s.type]}×${s.amount}`;
        }).join('、');
    }

    private _grantOne(spec: RewardGrantSpec): { ok: boolean; workers: Node[] } {
        switch (spec.type) {
            case RewardType.PineappleJuice:
                return this._grantCurrency(CurrencyType.PineappleJuice, spec.amount, SoundEffect.CollectJuice);
            case RewardType.GoldCoin:
                return this._grantCurrency(CurrencyType.GoldCoin, spec.amount, SoundEffect.CollectCoin);
            case RewardType.Worker:
                return this._grantWorkers(
                    spec.amount,
                    spec.workerVariant ?? WorkerRewardVariant.WorkerNan2,
                    this.workerSpawnBase,
                );
            default:
                return { ok: false, workers: [] };
        }
    }

    private _grantCurrency(
        type: CurrencyType,
        amount: number,
        sfx: SoundEffect,
    ): { ok: boolean; workers: Node[] } {
        const wallet = CurrencyWallet.instance ?? CurrencyWallet.ensure();
        wallet.add(type, amount);
        AudioController.instance?.play(sfx);
        return { ok: true, workers: [] };
    }

    private _grantWorkers(
        count: number,
        variant: WorkerRewardVariant,
        base: Vec3,
    ): { ok: boolean; workers: Node[] } {
        const prefab = this._npcPrefab ?? this.workerPrefab;
        if (!prefab) {
            console.warn('[RewardManager] 工人预制体未就绪，请稍后再试');
            return { ok: false, workers: [] };
        }

        const appearance = WORKER_APPEARANCE[variant];
        const parent = this._resolveWorkerParent();
        const spawned: Node[] = [];

        for (let i = 0; i < count; i += 1) {
            const index = this._workerSeq++;
            const pos = new Vec3(
                base.x + (index % 5) * this.workerSpawnSpacing,
                base.y,
                base.z + Math.floor(index / 5) * this.workerSpawnSpacing,
            );
            const node = this._instantiateWorker(parent, prefab, appearance, index, pos);
            if (node) {
                spawned.push(node);
                this._workers.add(node);
            }
        }

        return { ok: spawned.length === count, workers: spawned };
    }

    private _grantWorkersAt(
        count: number,
        variant: WorkerRewardVariant,
        positions: readonly Vec3[],
        lookAtTarget?: Vec3,
    ): { ok: boolean; workers: Node[] } {
        if (positions.length === 0) {
            return { ok: false, workers: [] };
        }

        const prefab = this._npcPrefab ?? this.workerPrefab;
        if (!prefab) {
            console.warn('[RewardManager] 工人预制体未就绪，请稍后再试');
            return { ok: false, workers: [] };
        }

        const appearance = WORKER_APPEARANCE[variant];
        const parent = this._resolveWorkerParent();
        const island = director.getScene()?.getChildByName('Island') ?? null;
        const spawned: Node[] = [];

        for (let i = 0; i < count; i += 1) {
            const index = this._workerSeq++;
            const template = positions[i % positions.length];
            const pos = IslandSurfaceSampler.snapWorldPositionToSurface(
                template.clone(),
                island,
                0,
            );
            const node = this._instantiateWorker(parent, prefab, appearance, index, pos);
            if (node) {
                if (lookAtTarget) {
                    this._faceTarget(node, lookAtTarget);
                }
                spawned.push(node);
                this._workers.add(node);
            }
        }

        return { ok: spawned.length === count, workers: spawned };
    }

    private _faceTarget(node: Node, target: Vec3): void {
        const pos = node.worldPosition;
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        if (dx * dx + dz * dz < 1e-6) {
            return;
        }
        const yaw = math.toDegree(Math.atan2(dx, dz));
        const rot = new Quat();
        Quat.fromEuler(rot, 0, yaw, 0);
        node.setWorldRotation(rot);
    }

    private _instantiateWorker(
        parent: Node,
        prefab: Prefab,
        appearance: CharacterAppearanceType,
        index: number,
        worldPos: Vec3,
    ): Node | null {
        const node = instantiate(prefab);
        parent.addChild(node);
        node.name = `Worker_${index}`;

        const controller = node.getComponent(AppearanceController)
            ?? node.addComponent(AppearanceController);
        controller.setAppearance(appearance);

        const anim = node.getComponent(CharacterAnimController)
            ?? node.addComponent(CharacterAnimController);
        anim.play(getDefaultAnimForAppearance(appearance));

        node.setWorldPosition(worldPos);
        return node;
    }

    private _preloadWorkerPrefab(): void {
        if (this.workerPrefab) {
            this._npcPrefab = this.workerPrefab;
            return;
        }

        resources.load(NPC_RIG_PREFAB_PATH, Prefab, (err, prefab) => {
            if (!err && prefab) {
                this._npcPrefab = prefab;
                return;
            }
            assetManager.loadAny({ uuid: NPC_RIG_PREFAB_UUID, type: Prefab }, (err2, asset) => {
                if (!err2 && asset) {
                    this._npcPrefab = asset as Prefab;
                } else {
                    console.warn('[RewardManager] NPC_RIG 加载失败', err2 ?? err);
                }
            });
        });
    }

    private _resolveWorkerParent(): Node {
        if (this.workerParent?.isValid) {
            return this.workerParent;
        }
        const island = director.getScene()?.getChildByName('Island');
        if (island) {
            let workers = island.getChildByName('Workers');
            if (!workers) {
                workers = new Node('Workers');
                island.addChild(workers);
            }
            this.workerParent = workers;
            return workers;
        }
        return director.getScene()!;
    }

    private _purgeInvalidWorkers(): void {
        for (const node of this._workers) {
            if (!node.isValid) {
                this._workers.delete(node);
            }
        }
    }

    private _notify(result: RewardGrantResult): void {
        for (const listener of this._listeners) {
            listener(result);
        }
    }
}
