import {
    assetManager,
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
import { WorkerAIController } from '../character/WorkerAIController';
import { WorkerFruitCarrier } from '../character/WorkerFruitCarrier';
import { WorkerMovementController } from '../character/WorkerMovementController';
import { IslandSurfaceSampler } from '../scene/IslandSurfaceSampler';
import { WorkerRewardVariant } from './RewardType';

const WORKER_APPEARANCE: Record<WorkerRewardVariant, CharacterAppearanceType> = {
    [WorkerRewardVariant.WorkerNan2]: CharacterAppearanceType.WorkerNan2,
    [WorkerRewardVariant.WorkerNv1]: CharacterAppearanceType.WorkerNv1,
};

let _workerSeq = 0;
let _npcPrefab: Prefab | null = null;
let _prefabLoading = false;

/**
 * 工人生成（与 RewardManager / PurchaseZone 解耦，避免循环依赖）。
 */
export class WorkerGrant {
    public static spawnAtPositions(
        count: number,
        variant: WorkerRewardVariant,
        positions: readonly Vec3[],
        lookAtTarget?: Vec3,
        prefabOverride?: Prefab | null,
    ): Node[] {
        if (count <= 0 || positions.length === 0) {
            return [];
        }

        const prefab = prefabOverride ?? _npcPrefab;
        if (!prefab) {
            WorkerGrant._preloadPrefab();
            console.warn('[WorkerGrant] 工人预制体未就绪，请稍后再试');
            return [];
        }

        const appearance = WORKER_APPEARANCE[variant];
        const parent = WorkerGrant._resolveWorkerParent();
        const island = director.getScene()?.getChildByName('Island') ?? null;
        const spawned: Node[] = [];

        for (let i = 0; i < count; i += 1) {
            const index = _workerSeq++;
            const template = positions[i % positions.length];
            const pos = IslandSurfaceSampler.snapWorldPositionToSurface(
                template.clone(),
                island,
                0,
            );
            const node = WorkerGrant._instantiateWorker(parent, prefab, appearance, index, pos);
            if (!node) {
                continue;
            }
            if (lookAtTarget) {
                WorkerGrant._faceTarget(node, lookAtTarget);
            }
            spawned.push(node);
        }

        return spawned;
    }

    public static spawnAtBase(
        count: number,
        variant: WorkerRewardVariant,
        base: Vec3,
        spacing: number,
        prefabOverride?: Prefab | null,
    ): Node[] {
        if (count <= 0) {
            return [];
        }

        const prefab = prefabOverride ?? _npcPrefab;
        if (!prefab) {
            WorkerGrant._preloadPrefab();
            console.warn('[WorkerGrant] 工人预制体未就绪，请稍后再试');
            return [];
        }

        const appearance = WORKER_APPEARANCE[variant];
        const parent = WorkerGrant._resolveWorkerParent();
        const spawned: Node[] = [];

        for (let i = 0; i < count; i += 1) {
            const index = _workerSeq++;
            const pos = new Vec3(
                base.x + (index % 5) * spacing,
                base.y,
                base.z + Math.floor(index / 5) * spacing,
            );
            const node = WorkerGrant._instantiateWorker(parent, prefab, appearance, index, pos);
            if (node) {
                spawned.push(node);
            }
        }

        return spawned;
    }

    public static bindPrefab(prefab: Prefab | null): void {
        if (prefab) {
            _npcPrefab = prefab;
        }
    }

    public static preloadPrefab(): void {
        WorkerGrant._preloadPrefab();
    }

    private static _instantiateWorker(
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

        node.addComponent(WorkerFruitCarrier);
        node.addComponent(WorkerMovementController);
        const ai = node.addComponent(WorkerAIController);
        ai.setSpawnPosition(worldPos);

        return node;
    }

    private static _faceTarget(node: Node, target: Vec3): void {
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

    private static _resolveWorkerParent(): Node {
        const island = director.getScene()?.getChildByName('Island');
        if (island) {
            let workers = island.getChildByName('Workers');
            if (!workers) {
                workers = new Node('Workers');
                island.addChild(workers);
            }
            return workers;
        }
        return director.getScene()!;
    }

    private static _preloadPrefab(): void {
        if (_npcPrefab || _prefabLoading) {
            return;
        }
        _prefabLoading = true;

        resources.load(NPC_RIG_PREFAB_PATH, Prefab, (err, prefab) => {
            _prefabLoading = false;
            if (!err && prefab) {
                _npcPrefab = prefab;
                return;
            }
            assetManager.loadAny({ uuid: NPC_RIG_PREFAB_UUID, type: Prefab }, (err2, asset) => {
                if (!err2 && asset) {
                    _npcPrefab = asset as Prefab;
                } else {
                    console.warn('[WorkerGrant] NPC_RIG 加载失败', err2 ?? err);
                }
            });
        });
    }
}
