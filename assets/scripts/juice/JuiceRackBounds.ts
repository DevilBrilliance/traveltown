import { geometry, Mat4, Mesh, MeshRenderer, Node, Vec3 } from 'cc';

/**
 * 读取节点下 Mesh 的世界 AABB，并做 XZ 平面拾取范围判定。
 */
export class JuiceRackBounds {
    private static readonly _worldMat = new Mat4();
    private static readonly _corner = new Vec3();
    private static readonly _worldCorner = new Vec3();
    private static readonly _tmpAabb = new geometry.AABB();

    /** 合并节点下所有 MeshRenderer 的世界包围盒 */
    public static readNodeWorldAabb(node: Node, out: geometry.AABB): boolean {
        const renderers = node.getComponentsInChildren(MeshRenderer);
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        let found = false;

        for (const renderer of renderers) {
            if (!renderer.node.activeInHierarchy) {
                continue;
            }
            if (!JuiceRackBounds._readRendererAabb(renderer, JuiceRackBounds._tmpAabb)) {
                continue;
            }
            const { center, halfExtents } = JuiceRackBounds._tmpAabb;
            minX = Math.min(minX, center.x - halfExtents.x);
            maxX = Math.max(maxX, center.x + halfExtents.x);
            minY = Math.min(minY, center.y - halfExtents.y);
            maxY = Math.max(maxY, center.y + halfExtents.y);
            minZ = Math.min(minZ, center.z - halfExtents.z);
            maxZ = Math.max(maxZ, center.z + halfExtents.z);
            found = true;
        }

        if (!found) {
            return false;
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

    /** 玩家 XZ 是否在 AABB 外扩 margin 的范围内（前后左右各扩 margin） */
    public static isPointInsideXZExpanded(aabb: geometry.AABB, x: number, z: number, margin: number): boolean {
        const { center, halfExtents } = aabb;
        const minX = center.x - halfExtents.x - margin;
        const maxX = center.x + halfExtents.x + margin;
        const minZ = center.z - halfExtents.z - margin;
        const maxZ = center.z + halfExtents.z + margin;
        return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    }

    private static _readRendererAabb(renderer: MeshRenderer, out: geometry.AABB): boolean {
        const model = renderer.model;
        if (model?.worldBounds) {
            geometry.AABB.copy(out, model.worldBounds);
            return true;
        }
        return JuiceRackBounds._readAabbFromMeshStruct(renderer, out);
    }

    private static _readAabbFromMeshStruct(renderer: MeshRenderer, out: geometry.AABB): boolean {
        const mesh = renderer.mesh as Mesh | null;
        const min = mesh?.struct?.minPosition;
        const max = mesh?.struct?.maxPosition;
        if (!min || !max) {
            return false;
        }

        renderer.node.getWorldMatrix(JuiceRackBounds._worldMat);

        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        for (let xi = 0; xi < 2; xi += 1) {
            for (let yi = 0; yi < 2; yi += 1) {
                for (let zi = 0; zi < 2; zi += 1) {
                    JuiceRackBounds._corner.set(
                        xi ? max.x : min.x,
                        yi ? max.y : min.y,
                        zi ? max.z : min.z,
                    );
                    Vec3.transformMat4(
                        JuiceRackBounds._worldCorner,
                        JuiceRackBounds._corner,
                        JuiceRackBounds._worldMat,
                    );
                    minX = Math.min(minX, JuiceRackBounds._worldCorner.x);
                    maxX = Math.max(maxX, JuiceRackBounds._worldCorner.x);
                    minY = Math.min(minY, JuiceRackBounds._worldCorner.y);
                    maxY = Math.max(maxY, JuiceRackBounds._worldCorner.y);
                    minZ = Math.min(minZ, JuiceRackBounds._worldCorner.z);
                    maxZ = Math.max(maxZ, JuiceRackBounds._worldCorner.z);
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
