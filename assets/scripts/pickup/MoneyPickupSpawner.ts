import {
    _decorator,
    assetManager,
    Component,
    director,
    geometry,
    instantiate,
    Mat4,
    Mesh,
    MeshRenderer,
    Node,
    Prefab,
    Vec3,
} from 'cc';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { MoneyPickup } from './MoneyPickup';

const { ccclass, property } = _decorator;

/** assets/models/模型/Mod/Money.FBX 导入后的预制体 UUID */
const MONEY_PREFAB_UUID = '633355e9-14ff-48a0-9bd2-fa72f6376b95@10ded';

/** 匹配栅栏节点名，排除地板（DiBan） */
const FENCE_NODE_NAME = /^(zhalan|ZhaLan)(?!.*DiBan)/i;

function samplePointInCircle(center: Vec3, radius: number, out: Vec3): Vec3 {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    out.set(
        center.x + Math.cos(angle) * r,
        center.y,
        center.z + Math.sin(angle) * r,
    );
    return out;
}

function isUnderExcludedNode(node: Node): boolean {
    let cur: Node | null = node;
    while (cur) {
        const name = cur.name;
        if (FENCE_NODE_NAME.test(name)) {
            return true;
        }
        if (name === 'Protagonist' || name === 'Customers' || name === 'MoneyPickups') {
            return true;
        }
        cur = cur.parent;
    }
    return false;
}

/**
 * 在指定圆心半径内生成钱币模型，玩家走近后自动拾取。
 * 生成时会采样 Island 表面高度，避免穿模。
 */
@ccclass('MoneyPickupSpawner')
export class MoneyPickupSpawner extends Component {
    @property({ tooltip: '圆心世界坐标' })
    center = new Vec3(6, 0, 0);

    @property({ tooltip: '生成半径' })
    radius = 5;

    @property({ tooltip: '生成数量' })
    count = 5;

    @property({ tooltip: '钱币模型缩放' })
    modelScale = new Vec3(2, 2, 2);

    @property({ tooltip: '贴地高度偏移，避免与表面 Z-fighting' })
    groundOffset = 0.05;

    @property({ tooltip: '钱币之间的最小水平间距' })
    minSeparation = 1.5;

    @property({ tooltip: '每个钱币的最大随机尝试次数' })
    maxPlacementAttempts = 40;

    @property({ type: Prefab, tooltip: '可选：拖入 Money 预制体，不填则按 UUID 加载' })
    moneyPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: '钱币父节点，不填则挂在 Island/MoneyPickups 下' })
    pickupParent: Node | null = null;

    @property({ tooltip: '启动时自动生成' })
    spawnOnStart = false;

    private readonly _coins: Node[] = [];
    private readonly _placedPositions: Vec3[] = [];
    private readonly _surfaceRenderers: MeshRenderer[] = [];
    private readonly _tmpAabb = new geometry.AABB();
    private readonly _worldMat = new Mat4();
    private readonly _corner = new Vec3();
    private readonly _worldCorner = new Vec3();
    private _didSpawn = false;

    start(): void {
        if (this.spawnOnStart) {
            this.spawnPickups();
        }
    }

    public spawnPickups(): void {
        if (this._didSpawn) {
            return;
        }
        if (this.moneyPrefab) {
            this._trySpawnWithRetry(this.moneyPrefab, 0);
            return;
        }
        MoneyPickupSpawner._loadMoneyPrefab((prefab) => {
            if (!this.isValid || this._didSpawn) {
                return;
            }
            this._trySpawnWithRetry(prefab, 0);
        });
    }

    private static _loadMoneyPrefab(onLoaded: (prefab: Prefab) => void): void {
        assetManager.loadAny({ uuid: MONEY_PREFAB_UUID, type: Prefab }, (err, asset) => {
            if (err || !asset) {
                console.warn('[MoneyPickupSpawner] Money 预制体加载失败', err);
                return;
            }
            onLoaded(asset as Prefab);
        });
    }

    private _trySpawnWithRetry(prefab: Prefab, attempt: number): void {
        this._collectSurfaceRenderers();
        if (this._surfaceRenderers.length === 0 && attempt < 10) {
            this.scheduleOnce(() => this._trySpawnWithRetry(prefab, attempt + 1), 0.1);
            return;
        }
        this._spawnWithPrefab(prefab);
        this._didSpawn = true;
    }

    private _collectSurfaceRenderers(): void {
        this._surfaceRenderers.length = 0;
        const island = director.getScene()?.getChildByName('Island');
        if (!island?.isValid) {
            return;
        }
        for (const renderer of island.getComponentsInChildren(MeshRenderer)) {
            if (!renderer.node.activeInHierarchy || isUnderExcludedNode(renderer.node)) {
                continue;
            }
            this._surfaceRenderers.push(renderer);
        }
    }

    private _spawnWithPrefab(prefab: Prefab): void {
        const parent = this._resolveParent();
        const candidate = new Vec3();
        const minDistSq = this.minSeparation * this.minSeparation;

        this._placedPositions.length = 0;
        this._coins.length = 0;

        for (let i = 0; i < this.count; i++) {
            let placed = false;
            for (let attempt = 0; attempt < this.maxPlacementAttempts; attempt++) {
                samplePointInCircle(this.center, this.radius, candidate);
                if (!this._resolveSurfacePosition(candidate.x, candidate.z, candidate)) {
                    continue;
                }
                if (this._isTooClose(candidate, minDistSq)) {
                    continue;
                }
                this._createCoin(prefab, parent, candidate, i + 1);
                this._placedPositions.push(candidate.clone());
                placed = true;
                break;
            }

            if (!placed) {
                samplePointInCircle(this.center, this.radius, candidate);
                if (!this._resolveSurfacePosition(candidate.x, candidate.z, candidate)) {
                    candidate.y = this.center.y + this.groundOffset;
                }
                this._createCoin(prefab, parent, candidate, i + 1);
                this._placedPositions.push(candidate.clone());
                console.warn(`[MoneyPickupSpawner] 钱币 ${i + 1} 未找到理想落点，已使用回退位置`);
            }
        }
    }

    private _createCoin(prefab: Prefab, parent: Node, pos: Vec3, index: number): void {
        const coin = instantiate(prefab);
        coin.name = `MoneyPickup_${index}`;
        coin.setParent(parent);
        coin.setWorldPosition(pos);
        coin.setScale(this.modelScale);
        coin.addComponent(MoneyPickup);
        AudioController.ensure().play(SoundEffect.Appear02);
        this._coins.push(coin);
    }

    /** 在 Island 网格表面采样落点，取该 XZ 下最高顶面 + 偏移 */
    private _resolveSurfacePosition(x: number, z: number, out: Vec3): boolean {
        let topY = -Infinity;
        let found = false;

        for (const renderer of this._surfaceRenderers) {
            if (!this._readWorldAabb(renderer, this._tmpAabb)) {
                continue;
            }
            const { center, halfExtents } = this._tmpAabb;
            if (x < center.x - halfExtents.x || x > center.x + halfExtents.x) {
                continue;
            }
            if (z < center.z - halfExtents.z || z > center.z + halfExtents.z) {
                continue;
            }
            const surfaceY = center.y + halfExtents.y;
            if (surfaceY > topY) {
                topY = surfaceY;
                found = true;
            }
        }

        if (!found) {
            return false;
        }
        out.set(x, topY + this.groundOffset, z);
        return true;
    }

    private _isTooClose(pos: Vec3, minDistSq: number): boolean {
        for (const placed of this._placedPositions) {
            const dx = pos.x - placed.x;
            const dz = pos.z - placed.z;
            if (dx * dx + dz * dz < minDistSq) {
                return true;
            }
        }
        return false;
    }

    private _readWorldAabb(renderer: MeshRenderer, out: geometry.AABB): boolean {
        const model = renderer.model;
        if (model?.worldBounds) {
            geometry.AABB.copy(out, model.worldBounds);
            return true;
        }
        return this._readAabbFromMeshStruct(renderer, out);
    }

    private _readAabbFromMeshStruct(renderer: MeshRenderer, out: geometry.AABB): boolean {
        const mesh = renderer.mesh as Mesh | null;
        const min = mesh?.struct?.minPosition;
        const max = mesh?.struct?.maxPosition;
        if (!min || !max) {
            return false;
        }

        renderer.node.getWorldMatrix(this._worldMat);

        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        for (let xi = 0; xi < 2; xi += 1) {
            for (let yi = 0; yi < 2; yi += 1) {
                for (let zi = 0; zi < 2; zi += 1) {
                    this._corner.set(
                        xi ? max.x : min.x,
                        yi ? max.y : min.y,
                        zi ? max.z : min.z,
                    );
                    Vec3.transformMat4(this._worldCorner, this._corner, this._worldMat);
                    minX = Math.min(minX, this._worldCorner.x);
                    maxX = Math.max(maxX, this._worldCorner.x);
                    minY = Math.min(minY, this._worldCorner.y);
                    maxY = Math.max(maxY, this._worldCorner.y);
                    minZ = Math.min(minZ, this._worldCorner.z);
                    maxZ = Math.max(maxZ, this._worldCorner.z);
                }
            }
        }

        geometry.AABB.set(
            out,
            (minX + maxX) * 0.5,
            (minY + maxY) * 0.5,
            (minZ + maxZ) * 0.5,
            (maxX - minX) * 0.5,
            (maxY - minY) * 0.5,
            (maxZ - minZ) * 0.5,
        );
        return true;
    }

    private _resolveParent(): Node {
        if (this.pickupParent?.isValid) {
            return this.pickupParent;
        }
        const island = director.getScene()?.getChildByName('Island');
        if (island) {
            let node = island.getChildByName('MoneyPickups');
            if (!node) {
                node = new Node('MoneyPickups');
                island.addChild(node);
            }
            this.pickupParent = node;
            return node;
        }
        return this.node;
    }
}
