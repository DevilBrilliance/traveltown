import {
    _decorator,
    Component,
    director,
    geometry,
    math,
    Mat4,
    Mesh,
    MeshRenderer,
    Node,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

const DEFAULT_FENCE_ROOT_NAMES = ['zhalan'] as const;
const FENCE_NODE_NAME = /^zhalan|ZhaLan/i;

interface FenceAabb {
    center: Vec3;
    halfExtents: Vec3;
}

/**
 * 栅栏碰撞：收集 Island 下所有栅栏模型的世界 AABB，阻挡玩家穿过。
 * 不再使用沙滩矩形空气墙。
 */
@ccclass('PlayAreaBoundary')
export class PlayAreaBoundary extends Component {
    private static _instance: PlayAreaBoundary | null = null;

    public static get instance(): PlayAreaBoundary | null {
        return PlayAreaBoundary._instance;
    }

    @property({ type: Node, tooltip: '栅栏分组根节点，不填则查找 Island/zhalan' })
    fenceRoot: Node | null = null;

    @property({ type: [String], tooltip: '栅栏分组节点名（Island 下）' })
    fenceGroupNames: string[] = [...DEFAULT_FENCE_ROOT_NAMES];

    @property({ tooltip: '是否扫描 Island 下所有名称含 ZhaLan 的节点' })
    scanZhaLanNodes = true;

    @property({ tooltip: '玩家碰撞半径' })
    playerRadius = 0.45;

    @property({ tooltip: 'AABB 向外扩展，避免贴模型太紧' })
    fencePadding = 0.05;

    @property({ tooltip: '就绪后在控制台打印栅栏数量（调试用）' })
    logBoundsOnReady = false;

    private readonly _tmpAabb = new geometry.AABB();
    private readonly _worldMat = new Mat4();
    private readonly _corner = new Vec3();
    private readonly _worldCorner = new Vec3();
    private readonly _fenceAabbs: FenceAabb[] = [];
    private _ready = false;
    private _rebuildAttempts = 0;

    onLoad() {
        PlayAreaBoundary._instance = this;
        this._resolveFenceRoot();
    }

    start() {
        this.rebuild();
    }

    onDestroy() {
        if (PlayAreaBoundary._instance === this) {
            PlayAreaBoundary._instance = null;
        }
    }

    public rebuild(): void {
        this._fenceAabbs.length = 0;
        this._resolveFenceRoot();

        const island = director.getScene()?.getChildByName('Island');
        if (!island?.isValid) {
            console.warn('[PlayAreaBoundary] 未找到 Island');
            this._ready = false;
            return;
        }

        const seen = new Set<MeshRenderer>();
        this._collectFenceRenderers(island, seen);

        for (const renderer of seen) {
            if (!renderer.node.activeInHierarchy) {
                continue;
            }
            if (!this._readWorldAabb(renderer, this._tmpAabb)) {
                continue;
            }
            const pad = this.fencePadding;
            this._fenceAabbs.push({
                center: this._tmpAabb.center.clone(),
                halfExtents: new Vec3(
                    this._tmpAabb.halfExtents.x + pad,
                    this._tmpAabb.halfExtents.y + pad,
                    this._tmpAabb.halfExtents.z + pad,
                ),
            });
        }

        if (this._fenceAabbs.length === 0) {
            this._rebuildAttempts += 1;
            if (this._rebuildAttempts <= 8) {
                this.scheduleOnce(() => this.rebuild(), 0.1);
            } else {
                console.warn('[PlayAreaBoundary] 未收集到栅栏 AABB');
                this._ready = false;
            }
            return;
        }

        this._ready = true;
        if (this.logBoundsOnReady) {
            console.log(`[PlayAreaBoundary] 栅栏碰撞体 ${this._fenceAabbs.length} 个`);
        }
    }

    /** 将世界坐标推出栅栏 AABB（XZ 平面圆形碰撞） */
    public clampWorldPosition(pos: Vec3): void {
        if (!this._ready) {
            return;
        }

        const r = this.playerRadius;
        for (let pass = 0; pass < 3; pass += 1) {
            for (const box of this._fenceAabbs) {
                this._resolveCircleAabbXZ(pos, r, box);
            }
        }
    }

    private _collectFenceRenderers(island: Node, seen: Set<MeshRenderer>): void {
        for (const groupName of this.fenceGroupNames) {
            const group = island.getChildByName(groupName) ?? this._findChildByName(island, groupName);
            if (group?.isValid) {
                for (const renderer of group.getComponentsInChildren(MeshRenderer)) {
                    seen.add(renderer);
                }
            }
        }

        if (!this.scanZhaLanNodes) {
            return;
        }

        this._collectZhaLanRenderers(island, seen);
    }

    private _collectZhaLanRenderers(root: Node, seen: Set<MeshRenderer>): void {
        if (FENCE_NODE_NAME.test(root.name)) {
            const renderer = root.getComponent(MeshRenderer);
            if (renderer) {
                seen.add(renderer);
            }
            for (const renderer of root.getComponentsInChildren(MeshRenderer)) {
                seen.add(renderer);
            }
        }

        for (const child of root.children) {
            this._collectZhaLanRenderers(child, seen);
        }
    }

    private _resolveCircleAabbXZ(pos: Vec3, radius: number, box: FenceAabb): void {
        const minX = box.center.x - box.halfExtents.x;
        const maxX = box.center.x + box.halfExtents.x;
        const minZ = box.center.z - box.halfExtents.z;
        const maxZ = box.center.z + box.halfExtents.z;

        const closestX = math.clamp(pos.x, minX, maxX);
        const closestZ = math.clamp(pos.z, minZ, maxZ);
        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;
        const rSq = radius * radius;

        if (distSq >= rSq) {
            return;
        }

        if (distSq < 1e-8) {
            const penLeft = pos.x - minX;
            const penRight = maxX - pos.x;
            const penBottom = pos.z - minZ;
            const penTop = maxZ - pos.z;
            const minPen = Math.min(penLeft, penRight, penBottom, penTop);
            if (minPen === penLeft) {
                pos.x = minX - radius;
            } else if (minPen === penRight) {
                pos.x = maxX + radius;
            } else if (minPen === penBottom) {
                pos.z = minZ - radius;
            } else {
                pos.z = maxZ + radius;
            }
            return;
        }

        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
    }

    private _resolveFenceRoot(): void {
        if (this.fenceRoot?.isValid) {
            return;
        }
        const island = director.getScene()?.getChildByName('Island');
        if (!island) {
            return;
        }
        for (const name of this.fenceGroupNames) {
            const node = island.getChildByName(name);
            if (node?.isValid) {
                this.fenceRoot = node;
                return;
            }
        }
    }

    private _findChildByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const child of root.children) {
            const found = this._findChildByName(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private _readWorldAabb(renderer: MeshRenderer, out: geometry.AABB): boolean {
        const model = renderer.model;
        if (model?.worldBounds) {
            geometry.AABB.copy(out, model.worldBounds);
            return true;
        }
        return this._collectFromMeshStruct(renderer, out);
    }

    private _collectFromMeshStruct(renderer: MeshRenderer, out: geometry.AABB): boolean {
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
}
