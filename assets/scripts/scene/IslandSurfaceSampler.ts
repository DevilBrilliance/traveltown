import {
    director,
    geometry,
    Mat4,
    Mesh,
    MeshRenderer,
    Node,
    Vec3,
} from 'cc';

const FENCE_NODE_NAME = /^(zhalan|ZhaLan)(?!.*DiBan)/i;

function isUnderExcludedNode(node: Node): boolean {
    let cur: Node | null = node;
    while (cur) {
        const name = cur.name;
        if (FENCE_NODE_NAME.test(name)) {
            return true;
        }
        if (name.endsWith('PurchaseZone')
            || name === 'PurchasePad'
            || name === 'PurchaseZoneView'
            || name === 'PanelRoot') {
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
 * 在 Island 网格上按 XZ 采样最高顶面 Y（含 ZhaLan_DiBan 等底板）。
 */
export class IslandSurfaceSampler {
    private static readonly _tmpAabb = new geometry.AABB();
    private static readonly _worldMat = new Mat4();
    private static readonly _corner = new Vec3();
    private static readonly _worldCorner = new Vec3();

    public static sampleTopY(
        x: number,
        z: number,
        island: Node | null = director.getScene()?.getChildByName('Island') ?? null,
    ): number | null {
        if (!island?.isValid) {
            return null;
        }

        let topY = -Infinity;
        let found = false;

        for (const renderer of island.getComponentsInChildren(MeshRenderer)) {
            if (!renderer.node.activeInHierarchy || isUnderExcludedNode(renderer.node)) {
                continue;
            }
            if (!IslandSurfaceSampler._readWorldAabb(renderer, IslandSurfaceSampler._tmpAabb)) {
                continue;
            }
            const { center, halfExtents } = IslandSurfaceSampler._tmpAabb;
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

        return found ? topY : null;
    }

    /** 将世界坐标 Y 贴到该 XZ 处的底板顶面（找不到表面时保留原 Y） */
    public static snapWorldPositionToSurface(
        pos: Vec3,
        island: Node | null = director.getScene()?.getChildByName('Island') ?? null,
        extraYOffset = 0,
        out?: Vec3,
    ): Vec3 {
        const result = out ?? pos.clone();
        result.set(pos);
        const topY = IslandSurfaceSampler.sampleTopY(pos.x, pos.z, island);
        if (topY !== null) {
            result.y = topY + extraYOffset;
        }
        return result;
    }

    private static _readWorldAabb(renderer: MeshRenderer, out: geometry.AABB): boolean {
        const model = renderer.model;
        if (model?.worldBounds) {
            out.copy(model.worldBounds);
            return true;
        }
        return IslandSurfaceSampler._readAabbFromMeshStruct(renderer, out);
    }

    private static _readAabbFromMeshStruct(renderer: MeshRenderer, out: geometry.AABB): boolean {
        const mesh = renderer.mesh as Mesh | null;
        const min = mesh?.struct?.minPosition;
        const max = mesh?.struct?.maxPosition;
        if (!min || !max) {
            return false;
        }

        const node = renderer.node;
        node.getWorldMatrix(IslandSurfaceSampler._worldMat);
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        const corners = [
            [min.x, min.y, min.z],
            [max.x, min.y, min.z],
            [min.x, max.y, min.z],
            [max.x, max.y, min.z],
            [min.x, min.y, max.z],
            [max.x, min.y, max.z],
            [min.x, max.y, max.z],
            [max.x, max.y, max.z],
        ] as const;

        for (const [cx, cy, cz] of corners) {
            Vec3.set(IslandSurfaceSampler._corner, cx, cy, cz);
            Vec3.transformMat4(IslandSurfaceSampler._worldCorner, IslandSurfaceSampler._corner, IslandSurfaceSampler._worldMat);
            minX = Math.min(minX, IslandSurfaceSampler._worldCorner.x);
            minY = Math.min(minY, IslandSurfaceSampler._worldCorner.y);
            minZ = Math.min(minZ, IslandSurfaceSampler._worldCorner.z);
            maxX = Math.max(maxX, IslandSurfaceSampler._worldCorner.x);
            maxY = Math.max(maxY, IslandSurfaceSampler._worldCorner.y);
            maxZ = Math.max(maxZ, IslandSurfaceSampler._worldCorner.z);
        }

        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;
        const cz = (minZ + maxZ) * 0.5;
        out.center.set(cx, cy, cz);
        out.halfExtents.set((maxX - minX) * 0.5, (maxY - minY) * 0.5, (maxZ - minZ) * 0.5);
        return true;
    }
}
