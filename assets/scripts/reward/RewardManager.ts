import {
    _decorator,
    Component,
    director,
    Node,
    Prefab,
    Vec3,
} from 'cc';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { CurrencyType } from '../currency/CurrencyType';
import { CurrencyWallet } from '../currency/CurrencyWallet';
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
import { WorkerGrant } from './WorkerGrant';

const { ccclass, property } = _decorator;

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

    onLoad() {
        if (RewardManager._instance && RewardManager._instance !== this) {
            this.node.destroy();
            return;
        }
        RewardManager._instance = this;
        director.addPersistRootNode(this.node);
        if (this.workerPrefab) {
            WorkerGrant.bindPrefab(this.workerPrefab);
        }
        WorkerGrant.preloadPrefab();
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

    public registerWorkers(workers: Node[]): void {
        for (const node of workers) {
            if (node?.isValid) {
                this._workers.add(node);
            }
        }
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
        const workers = WorkerGrant.spawnAtBase(
            count,
            variant,
            base,
            this.workerSpawnSpacing,
            this.workerPrefab,
        );
        this.registerWorkers(workers);
        const result: RewardGrantResult = {
            success: workers.length === count,
            granted: workers.length > 0
                ? [{ type: RewardType.Worker, amount: workers.length, workerVariant: variant }]
                : [],
            spawnedWorkers: workers,
        };
        if (result.granted.length > 0) {
            this._notify(result);
        }
        return workers;
    }

    /** 在指定世界坐标生成工人，并可统一朝向目标点 */
    public grantWorkersAt(
        count: number,
        variant: WorkerRewardVariant = WorkerRewardVariant.WorkerNan2,
        positions: readonly Vec3[],
        lookAtTarget?: Vec3,
    ): Node[] {
        const workers = WorkerGrant.spawnAtPositions(
            count,
            variant,
            positions,
            lookAtTarget,
            this.workerPrefab,
        );
        this.registerWorkers(workers);
        const result: RewardGrantResult = {
            success: workers.length === count,
            granted: workers.length > 0
                ? [{ type: RewardType.Worker, amount: workers.length, workerVariant: variant }]
                : [],
            spawnedWorkers: workers,
        };
        if (result.granted.length > 0) {
            this._notify(result);
        }
        return workers;
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
            case RewardType.Worker: {
                const workers = WorkerGrant.spawnAtBase(
                    spec.amount,
                    spec.workerVariant ?? WorkerRewardVariant.WorkerNan2,
                    this.workerSpawnBase,
                    this.workerSpawnSpacing,
                    this.workerPrefab,
                );
                this.registerWorkers(workers);
                return { ok: workers.length === spec.amount, workers };
            }
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
