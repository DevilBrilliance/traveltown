import { Node, Vec3 } from 'cc';
import { FruitCollectZone } from './FruitCollectZone';
import { FruitSource } from './FruitSource';
import { FruitType } from './FruitType';

const _fruitPos = new Vec3();

/** 菠萝田采集辅助：为工人查找可收割且未被他人预定的菠萝 */
export class PineappleFieldHelper {
    public static hasAvailablePineapple(): boolean {
        for (const zone of FruitCollectZone.all) {
            if (zone.fruitType !== FruitType.Pineapple) {
                continue;
            }
            for (const source of zone.sources) {
                if (source.isAvailable) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 该工人是否还能抢到一株菠萝（未被他人预定） */
    public static hasHarvestablePineappleFor(worker: Node): boolean {
        for (const zone of FruitCollectZone.all) {
            if (zone.fruitType !== FruitType.Pineapple) {
                continue;
            }
            for (const source of zone.sources) {
                if (source.isAvailable && !source.isReservedByOther(worker)) {
                    return true;
                }
            }
        }
        return false;
    }

    public static findNearestPineapple(
        worker: Node,
        fromWorldPos: Vec3,
        reserve = true,
    ): FruitSource | null {
        let best: FruitSource | null = null;
        let bestDistSq = Infinity;

        for (const zone of FruitCollectZone.all) {
            if (zone.fruitType !== FruitType.Pineapple) {
                continue;
            }
            for (const source of zone.sources) {
                if (!source.isAvailable || source.isReservedByOther(worker)) {
                    continue;
                }
                source.getCollectWorldPosition(_fruitPos);
                const dx = fromWorldPos.x - _fruitPos.x;
                const dz = fromWorldPos.z - _fruitPos.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    best = source;
                }
            }
        }

        if (!best) {
            return null;
        }
        if (reserve && !best.tryReserve(worker)) {
            return null;
        }
        return best;
    }

    public static releaseIfReserved(source: FruitSource | null, worker: Node): void {
        source?.releaseReservation(worker);
    }
}
