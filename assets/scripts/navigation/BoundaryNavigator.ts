import { math, Node, Quat, Vec3 } from 'cc';
import { PlayAreaBoundary } from '../scene/PlayAreaBoundary';

const DETOUR_DEGREES = [35, -35, 70, -70, 110, -110];

export interface BoundaryMoveResult {
    arrived: boolean;
    moving: boolean;
}

/**
 * 沿 XZ 朝目标移动，每步用 PlayAreaBoundary 推出栅栏 AABB；受阻时尝试绕行。
 */
export class BoundaryNavigator {
    private static readonly _nextPos = new Vec3();
    private static readonly _tryPos = new Vec3();

    public static moveToward(
        node: Node,
        target: Vec3,
        speed: number,
        dt: number,
        boundary: PlayAreaBoundary | null,
        arriveRadius = 0.65,
        rotateSpeed = 540,
    ): BoundaryMoveResult {
        const pos = node.worldPosition;
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq <= arriveRadius * arriveRadius) {
            return { arrived: true, moving: false };
        }

        const dist = Math.sqrt(distSq);
        let dirX = dx / dist;
        let dirZ = dz / dist;
        const step = Math.min(speed * dt, dist);

        let moved = BoundaryNavigator._tryStep(node, pos, dirX, dirZ, step, boundary);
        if (!moved) {
            for (const deg of DETOUR_DEGREES) {
                const rad = math.toRadian(deg);
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                const altX = dirX * cos - dirZ * sin;
                const altZ = dirX * sin + dirZ * cos;
                moved = BoundaryNavigator._tryStep(node, pos, altX, altZ, step, boundary);
                if (moved) {
                    dirX = altX;
                    dirZ = altZ;
                    break;
                }
            }
        }

        if (moved) {
            BoundaryNavigator._rotateToward(node, dirX, dirZ, rotateSpeed, dt);
            return { arrived: false, moving: true };
        }
        return { arrived: false, moving: false };
    }

    public static stop(): void {
        // no-op; caller clears movement state
    }

    private static _tryStep(
        node: Node,
        pos: Vec3,
        dirX: number,
        dirZ: number,
        step: number,
        boundary: PlayAreaBoundary | null,
    ): boolean {
        const next = BoundaryNavigator._nextPos;
        next.set(pos.x + dirX * step, pos.y, pos.z + dirZ * step);
        boundary?.clampWorldPosition(next);

        const movedSq = (next.x - pos.x) ** 2 + (next.z - pos.z) ** 2;
        if (movedSq < 1e-5) {
            return false;
        }
        node.setWorldPosition(next);
        return true;
    }

    private static _rotateToward(
        node: Node,
        dirX: number,
        dirZ: number,
        rotateSpeed: number,
        dt: number,
    ): void {
        const targetY = math.toDegree(Math.atan2(dirX, dirZ));
        const euler = new Vec3();
        const quat = new Quat();
        node.worldRotation.getEulerAngles(euler);
        let currentY = euler.y;
        let delta = targetY - currentY;
        while (delta > 180) {
            delta -= 360;
        }
        while (delta < -180) {
            delta += 360;
        }
        const step = rotateSpeed * dt;
        const newY = Math.abs(delta) <= step ? targetY : currentY + Math.sign(delta) * step;
        Quat.fromEuler(quat, 0, newY, 0);
        node.setWorldRotation(quat);
    }
}
