import {
    _decorator,
    Component,
    director,
    geometry,
    Mat4,
    Mesh,
    MeshRenderer,
    Node,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

const AREA_ROOT_NAMES = ['Sand', 'ShaTan', 'shatan'];

/**
 * ShaTan 网格 bounds（Sand scale=1.35, pos=0）反算的世界 XZ 范围：
 * mesh x∈[-8.87, 56.66], y∈[-31.82, 16.84]，子节点 ShaTan 绕 X 转 -90°
 * → world X∈[-11.98, 76.49], Z∈[-22.73, 42.96]
 */
const BAKED_SHA_TAN_MIN_X = -12;
const BAKED_SHA_TAN_MAX_X = 76.5;
const BAKED_SHA_TAN_MIN_Z = -22.7;
const BAKED_SHA_TAN_MAX_Z = 43;

/**
 * 沙滩可玩区域边界（纯代码 clamp，无物理碰撞体）。
 */
@ccclass('PlayAreaBoundary')
export class PlayAreaBoundary extends Component {
    private static _instance: PlayAreaBoundary | null = null;

    public static get instance(): PlayAreaBoundary | null {
        return PlayAreaBoundary._instance;
    }

    @property({ tooltip: '手动指定边界（Playable 打包时可勾选并沿用下方数值）' })
    useManualBounds = false;

    @property({ tooltip: '可玩区 X 最小值（世界坐标）' })
    manualMinX = BAKED_SHA_TAN_MIN_X;

    @property({ tooltip: '可玩区 X 最大值（世界坐标）' })
    manualMaxX = BAKED_SHA_TAN_MAX_X;

    @property({ tooltip: '可玩区 Z 最小值（世界坐标）' })
    manualMinZ = BAKED_SHA_TAN_MIN_Z;

    @property({ tooltip: '可玩区 Z 最大值（世界坐标）' })
    manualMaxZ = BAKED_SHA_TAN_MAX_Z;

    @property({ type: Node, tooltip: '自动模式：沙滩根节点，不填则查找 Sand / ShaTan' })
    areaRoot: Node | null = null;

    @property({ tooltip: '自动模式：从网格 AABB 向内缩进' })
    margin = 0.6;

    @property({ tooltip: '玩家半径，clamp 时留边' })
    playerRadius = 0.45;

    @property({ tooltip: '就绪后在控制台打印边界（调试用）' })
    logBoundsOnReady = true;

    private readonly _worldAabb = new geometry.AABB();
    private readonly _tmpAabb = new geometry.AABB();
    private readonly _worldMat = new Mat4();
    private readonly _corner = new Vec3();
    private readonly _worldCorner = new Vec3();
    private _minX = 0;
    private _maxX = 0;
    private _minZ = 0;
    private _maxZ = 0;
    private _ready = false;
    private _rebuildAttempts = 0;

    onLoad() {
        PlayAreaBoundary._instance = this;
        this._resolveAreaRoot();
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
        if (this.useManualBounds) {
            this._applyManualBounds();
            this._logBounds('manual');
            return;
        }

        this._resolveAreaRoot();
        if (!this.areaRoot?.isValid) {
            console.warn('[PlayAreaBoundary] 未找到沙滩节点（Sand / ShaTan）');
            this._ready = false;
            return;
        }

        if (!this._collectWorldAabb(this.areaRoot, this._worldAabb)) {
            this._rebuildAttempts += 1;
            if (this._rebuildAttempts <= 5) {
                this.scheduleOnce(() => this.rebuild(), 0.1);
            } else {
                console.warn('[PlayAreaBoundary] 无法读取沙滩网格，回退到烘焙边界');
                this.useManualBounds = true;
                this._applyManualBounds();
                this._logBounds('baked-fallback');
            }
            return;
        }

        const { center, halfExtents } = this._worldAabb;
        this._minX = center.x - halfExtents.x + this.margin;
        this._maxX = center.x + halfExtents.x - this.margin;
        this._minZ = center.z - halfExtents.z + this.margin;
        this._maxZ = center.z + halfExtents.z - this.margin;
        if (this._validateBounds()) {
            this._logBounds('auto');
        }
    }

    /** 将世界坐标限制在沙滩可玩区域内 */
    public clampWorldPosition(pos: Vec3): void {
        if (!this._ready) {
            return;
        }
        const r = this.playerRadius;
        const minX = this._minX + r;
        const maxX = this._maxX - r;
        const minZ = this._minZ + r;
        const maxZ = this._maxZ - r;
        if (pos.x < minX) {
            pos.x = minX;
        } else if (pos.x > maxX) {
            pos.x = maxX;
        }
        if (pos.z < minZ) {
            pos.z = minZ;
        } else if (pos.z > maxZ) {
            pos.z = maxZ;
        }
    }

    private _applyManualBounds(): void {
        this._minX = this.manualMinX;
        this._maxX = this.manualMaxX;
        this._minZ = this.manualMinZ;
        this._maxZ = this.manualMaxZ;
        this._validateBounds();
    }

    private _validateBounds(): boolean {
        if (this._minX >= this._maxX || this._minZ >= this._maxZ) {
            console.warn('[PlayAreaBoundary] 边界无效');
            this._ready = false;
            return false;
        }
        this._ready = true;
        return true;
    }

    private _logBounds(source: string): void {
        if (!this.logBoundsOnReady || !this._ready) {
            return;
        }
        console.log(
            `[PlayAreaBoundary] ${source} X[${this._minX.toFixed(2)}, ${this._maxX.toFixed(2)}]`
            + ` Z[${this._minZ.toFixed(2)}, ${this._maxZ.toFixed(2)}] margin=${this.margin}`,
        );
    }

    private _resolveAreaRoot(): void {
        if (this.areaRoot?.isValid) {
            return;
        }
        const island = director.getScene()?.getChildByName('Island');
        if (!island) {
            return;
        }
        for (const name of AREA_ROOT_NAMES) {
            const node = island.getChildByName(name);
            if (node?.isValid) {
                this.areaRoot = node;
                return;
            }
        }
        this.areaRoot = this._findByNameDeep(island, AREA_ROOT_NAMES);
    }

    private _findByNameDeep(root: Node, names: readonly string[]): Node | null {
        for (const name of names) {
            const found = this._findChildByName(root, name);
            if (found) {
                return found;
            }
        }
        return null;
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

    private _collectWorldAabb(root: Node, out: geometry.AABB): boolean {
        let merged = false;
        const renderers = root.getComponentsInChildren(MeshRenderer);
        for (const renderer of renderers) {
            const model = renderer.model;
            if (model?.worldBounds) {
                geometry.AABB.copy(this._tmpAabb, model.worldBounds);
            } else if (!this._collectFromMeshStruct(renderer, this._tmpAabb)) {
                continue;
            }

            if (!merged) {
                geometry.AABB.copy(out, this._tmpAabb);
                merged = true;
            } else {
                geometry.AABB.merge(out, out, this._tmpAabb);
            }
        }
        return merged;
    }

    /** model.worldBounds 未就绪时，用 mesh.struct + 世界矩阵计算 */
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

        for (let xi = 0; xi < 2; xi++) {
            for (let yi = 0; yi < 2; yi++) {
                for (let zi = 0; zi < 2; zi++) {
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
