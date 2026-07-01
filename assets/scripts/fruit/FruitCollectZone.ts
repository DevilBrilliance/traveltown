import { _decorator, Component, Enum, Node, Vec3 } from 'cc';
import { FruitSource } from './FruitSource';
import { FruitType } from './FruitType';

const { ccclass, property } = _decorator;

/**
 * 水果采集区：标记 boluoNode / juziNode 等区域，供 PlayerFruitCarrier 在 tick 中检测。
 * 不使用物理触发器，仅提供位置与半径查询。
 */
@ccclass('FruitCollectZone')
export class FruitCollectZone extends Component {
    private static _zones: FruitCollectZone[] = [];

    @property({ type: Enum(FruitType), tooltip: '该区域产出的水果类型' })
    fruitType: FruitType = FruitType.Pineapple;

    @property({ tooltip: '玩家与水果 XZ 距离小于该值时可采集' })
    collectRadius = 2.5;

    @property({ tooltip: '区域整体半径（XZ），0 表示仅按水果距离检测' })
    zoneRadius = 0;

    @property({ tooltip: '打印采集区调试信息' })
    debugLog = true;

    private _sources: FruitSource[] = [];
    private readonly _tmpFruit = new Vec3();
    private readonly _tmpZone = new Vec3();

    public static get all(): readonly FruitCollectZone[] {
        return FruitCollectZone._zones;
    }

    onEnable() {
        FruitCollectZone._zones.push(this);
    }

    onDisable() {
        const index = FruitCollectZone._zones.indexOf(this);
        if (index >= 0) {
            FruitCollectZone._zones.splice(index, 1);
        }
    }

    /** 扫描子节点并绑定 FruitSource */
    public bindFruitSources(): void {
        this._sources.length = 0;
        for (const child of this.node.children) {
            this._bindSourceOn(child);
        }
        if (this.debugLog) {
            const sample = this._sources[0]?.node;
            sample?.getWorldPosition(this._tmpFruit);
            console.log(
                `[FruitCollectZone] ${this.node.name} type=${FruitType[this.fruitType]} `
                + `sources=${this._sources.length} collectR=${this.collectRadius} `
                + `zonePos=(${this.node.worldPosition.x.toFixed(1)}, ${this.node.worldPosition.z.toFixed(1)}) `
                + `sampleFruit=(${this._tmpFruit.x.toFixed(1)}, ${this._tmpFruit.z.toFixed(1)})`,
            );
        }
    }

    public get sources(): readonly FruitSource[] {
        return this._sources;
    }

    /** 玩家是否在该采集区范围内（靠近区域锚点或任一水果） */
    public isPlayerInZone(playerWorldPos: Vec3): boolean {
        if (this.zoneRadius <= 0) {
            return this._findNearestAvailableDistSq(playerWorldPos, this.collectRadius) !== null;
        }

        const zoneR = Math.max(this.zoneRadius, this.collectRadius);
        const zoneRSq = zoneR * zoneR;

        this.node.getWorldPosition(this._tmpZone);
        let dx = playerWorldPos.x - this._tmpZone.x;
        let dz = playerWorldPos.z - this._tmpZone.z;
        if (dx * dx + dz * dz <= zoneRSq) {
            return true;
        }

        for (const source of this._sources) {
            if (!source.isAvailable) {
                continue;
            }
            source.node.getWorldPosition(this._tmpFruit);
            dx = playerWorldPos.x - this._tmpFruit.x;
            dz = playerWorldPos.z - this._tmpFruit.z;
            if (dx * dx + dz * dz <= zoneRSq) {
                return true;
            }
        }
        return false;
    }

    /** 在采集半径内找最近的可采集水果 */
    public findNearestAvailable(playerWorldPos: Vec3, radiusOverride?: number): FruitSource | null {
        const radius = radiusOverride ?? this.collectRadius;
        const radiusSq = radius * radius;
        let best: FruitSource | null = null;
        let bestDistSq = radiusSq;

        for (const source of this._sources) {
            if (!source.isAvailable) {
                continue;
            }
            source.node.getWorldPosition(this._tmpFruit);
            const dx = playerWorldPos.x - this._tmpFruit.x;
            const dz = playerWorldPos.z - this._tmpFruit.z;
            const distSq = dx * dx + dz * dz;
            if (distSq <= bestDistSq) {
                bestDistSq = distSq;
                best = source;
            }
        }
        return best;
    }

    /** 返回最近可采集水果的距离平方，无则 null */
    public getNearestAvailableDist(playerWorldPos: Vec3, radiusOverride?: number): number | null {
        const radius = radiusOverride ?? this.collectRadius;
        const radiusSq = radius * radius;
        let bestDistSq: number | null = null;

        for (const source of this._sources) {
            if (!source.isAvailable) {
                continue;
            }
            source.node.getWorldPosition(this._tmpFruit);
            const dx = playerWorldPos.x - this._tmpFruit.x;
            const dz = playerWorldPos.z - this._tmpFruit.z;
            const distSq = dx * dx + dz * dz;
            if (bestDistSq === null || distSq < bestDistSq) {
                bestDistSq = distSq;
            }
        }
        if (bestDistSq === null || bestDistSq > radiusSq) {
            return null;
        }
        return Math.sqrt(bestDistSq);
    }

    private _findNearestAvailableDistSq(playerWorldPos: Vec3, radius: number): number | null {
        const dist = this.getNearestAvailableDist(playerWorldPos, radius);
        return dist === null ? null : dist * dist;
    }

    private _bindSourceOn(node: Node): void {
        let source = node.getComponent(FruitSource);
        if (!source) {
            source = node.addComponent(FruitSource);
        }
        source.fruitType = this.fruitType;
        source.zone = this;
        this._sources.push(source);
    }
}
