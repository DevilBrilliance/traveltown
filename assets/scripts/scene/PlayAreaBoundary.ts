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
import { JuiceRackBounds } from '../juice/JuiceRackBounds';

const { ccclass, property } = _decorator;

const DEFAULT_FENCE_ROOT_NAMES = ['zhalan'] as const;
/** 匹配栅栏节点名，但排除地板（DiBan） */
const FENCE_NODE_NAME = /^(zhalan|ZhaLan)(?!.*DiBan)/i;
/** 机关门（单独注册碰撞，不参与栅栏扫描） */
const GATE_DOOR_NODE_NAMES = new Set(['Men', 'Men-001']);

interface FenceAabb {
    center: Vec3;
    halfExtents: Vec3;
}

interface SceneOccluderAabb {
    center: Vec3;
    halfExtents: Vec3;
    node: Node;
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

    @property({ type: [String], tooltip: '额外栅栏碰撞节点名（Island 下深度查找，含榨汁机）' })
    extraFenceNodeNames: string[] = ['JiQi', 'JiQi_RIG'];

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
    private readonly _manualFenceAabbs: FenceAabb[] = [];
    private readonly _sceneOccluderAabbs: SceneOccluderAabb[] = [];
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
        this._sceneOccluderAabbs.length = 0;
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
            this._pushFenceAabb(this._tmpAabb);
        }

        this._collectExtraFenceNodes(island);

        this._collectSceneOccluders(island);

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
            for (const box of this._manualFenceAabbs) {
                this._resolveCircleAabbXZ(pos, r, box);
            }
        }
    }

    /**
     * 线段 from→to 是否被栅栏 AABB 遮挡（用于头顶气泡等）
     * @param margin 目标点前预留距离，避免贴脸误判
     */
    public isLineOccludedByFences(from: Vec3, to: Vec3, margin = 0.35): boolean {
        return this.isLineOccluded(from, to, margin);
    }

    /**
     * 线段 from→to 是否被场景物体（栅栏/建筑等）遮挡。
     * @param ignoreNodes 忽略这些节点及其子节点上的碰撞体（如角色自身）
     */
    public isLineOccluded(
        from: Vec3,
        to: Vec3,
        margin = 0.35,
        ignoreNodes: Node[] = [],
    ): boolean {
        if (!this._ready) {
            return false;
        }
        const dir = new Vec3();
        Vec3.subtract(dir, to, from);
        const maxDist = dir.length();
        if (maxDist < 1e-4) {
            return false;
        }
        dir.multiplyScalar(1 / maxDist);
        const checkDist = Math.max(0, maxDist - margin);

        for (const box of this._fenceAabbs) {
            if (PlayAreaBoundary._rayIntersectsAabb(from, dir, box, checkDist)) {
                return true;
            }
        }
        for (const box of this._manualFenceAabbs) {
            if (PlayAreaBoundary._rayIntersectsAabb(from, dir, box, checkDist)) {
                return true;
            }
        }
        for (const box of this._sceneOccluderAabbs) {
            if (this._isUnderIgnore(box.node, ignoreNodes)) {
                continue;
            }
            if (PlayAreaBoundary._rayIntersectsAabb(from, dir, box, checkDist)) {
                return true;
            }
        }
        return false;
    }

    private static _rayIntersectsAabb(
        origin: Vec3,
        dir: Vec3,
        box: FenceAabb,
        maxDist: number,
    ): boolean {
        const minX = box.center.x - box.halfExtents.x;
        const maxX = box.center.x + box.halfExtents.x;
        const minY = box.center.y - box.halfExtents.y;
        const maxY = box.center.y + box.halfExtents.y;
        const minZ = box.center.z - box.halfExtents.z;
        const maxZ = box.center.z + box.halfExtents.z;

        let tmin = 0;
        let tmax = maxDist;

        const axes = [
            { o: origin.x, d: dir.x, min: minX, max: maxX },
            { o: origin.y, d: dir.y, min: minY, max: maxY },
            { o: origin.z, d: dir.z, min: minZ, max: maxZ },
        ];

        for (const { o, d, min, max } of axes) {
            if (Math.abs(d) < 1e-8) {
                if (o < min || o > max) {
                    return false;
                }
                continue;
            }
            const inv = 1 / d;
            let t1 = (min - o) * inv;
            let t2 = (max - o) * inv;
            if (t1 > t2) {
                const tmp = t1;
                t1 = t2;
                t2 = tmp;
            }
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) {
                return false;
            }
        }
        return tmax >= 0 && tmin <= maxDist;
    }

    private _collectExtraFenceNodes(island: Node): void {
        for (const name of this.extraFenceNodeNames) {
            const node = island.getChildByName(name) ?? this._findChildByName(island, name);
            if (!node?.isValid) {
                continue;
            }
            if (!JuiceRackBounds.readNodeWorldAabb(node, this._tmpAabb, true)) {
                continue;
            }
            this._pushFenceAabb(this._tmpAabb);
        }
    }

    /** 机关门关闭态 AABB（与 zhalan 无关，注册时快照一次） */
    public setManualFenceNodes(nodes: readonly (Node | null)[]): void {
        this._manualFenceAabbs.length = 0;
        for (const node of nodes) {
            if (!node?.isValid) {
                continue;
            }
            if (!JuiceRackBounds.readNodeWorldAabb(node, this._tmpAabb, true)) {
                continue;
            }
            this._manualFenceAabbs.push(this._cloneFenceAabb(this._tmpAabb));
        }
    }

    /** 开门后移除机关门碰撞（不触碰 zhalan） */
    public clearManualFenceAabbs(): void {
        this._manualFenceAabbs.length = 0;
    }

    private _cloneFenceAabb(aabb: geometry.AABB): FenceAabb {
        const pad = this.fencePadding;
        return {
            center: aabb.center.clone(),
            halfExtents: new Vec3(
                aabb.halfExtents.x + pad,
                aabb.halfExtents.y + pad,
                aabb.halfExtents.z + pad,
            ),
        };
    }

    private _pushFenceAabb(aabb: geometry.AABB): void {
        const pad = this.fencePadding;
        this._fenceAabbs.push({
            center: aabb.center.clone(),
            halfExtents: new Vec3(
                aabb.halfExtents.x + pad,
                aabb.halfExtents.y + pad,
                aabb.halfExtents.z + pad,
            ),
        });
    }

    private _collectSceneOccluders(island: Node): void {
        const seen = new Set<MeshRenderer>();
        for (const renderer of island.getComponentsInChildren(MeshRenderer)) {
            if (seen.has(renderer) || !renderer.node.activeInHierarchy) {
                continue;
            }
            if (this._shouldExcludeOccluderByName(renderer.node)) {
                continue;
            }
            if (!this._readWorldAabb(renderer, this._tmpAabb)) {
                continue;
            }
            if (this._isFlatGroundAabb(this._tmpAabb)) {
                continue;
            }
            seen.add(renderer);
            const pad = this.fencePadding;
            this._sceneOccluderAabbs.push({
                node: renderer.node,
                center: this._tmpAabb.center.clone(),
                halfExtents: new Vec3(
                    this._tmpAabb.halfExtents.x + pad,
                    this._tmpAabb.halfExtents.y + pad,
                    this._tmpAabb.halfExtents.z + pad,
                ),
            });
        }
    }

    private _shouldExcludeOccluderByName(node: Node): boolean {
        let current: Node | null = node;
        while (current) {
            const name = current.name;
            if (name === 'Protagonist' || /^Customer/i.test(name) || /^Worker_/i.test(name) || /^Waiter_/i.test(name)) {
                return true;
            }
            if (/DiBan/i.test(name)) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    private _isFlatGroundAabb(aabb: geometry.AABB): boolean {
        const { halfExtents } = aabb;
        return halfExtents.y < 0.25 && halfExtents.x > 3 && halfExtents.z > 3;
    }

    private _isUnderIgnore(node: Node, ignoreNodes: Node[]): boolean {
        for (const root of ignoreNodes) {
            if (!root?.isValid) {
                continue;
            }
            let current: Node | null = node;
            while (current) {
                if (current === root) {
                    return true;
                }
                current = current.parent;
            }
        }
        return false;
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
        if (PlayAreaBoundary._isGateDoorNode(root)) {
            return;
        }

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
            if (PlayAreaBoundary._isGateDoorNode(child)) {
                continue;
            }
            this._collectZhaLanRenderers(child, seen);
        }
    }

    private static _isGateDoorNode(node: Node): boolean {
        let current: Node | null = node;
        while (current) {
            if (GATE_DOOR_NODE_NAMES.has(current.name)) {
                return true;
            }
            current = current.parent;
        }
        return false;
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
            out.copy(model.worldBounds);
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

        out.center.set(
            (minX + maxX) * 0.5,
            (minY + maxY) * 0.5,
            (minZ + maxZ) * 0.5,
        );
        out.halfExtents.set(
            (maxX - minX) * 0.5,
            (maxY - minY) * 0.5,
            (maxZ - minZ) * 0.5,
        );
        return true;
    }
}
