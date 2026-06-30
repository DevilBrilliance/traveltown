import {
    Mat4,
    Mesh,
    MeshRenderer,
    Node,
} from 'cc';

export interface StaticBatchResult {
    /** 成功合批次数（每个 ≈ 1 DrawCall） */
    batches: number;
    /** 被合并关掉的 MeshRenderer 数量 */
    mergedRenderers: number;
}

function _sameMaterials(a: MeshRenderer, b: MeshRenderer): boolean {
    const count = a.sharedMaterials.length;
    if (count !== b.sharedMaterials.length) {
        return false;
    }
    for (let i = 0; i < count; i++) {
        if (a.getRenderMaterial(i) !== b.getRenderMaterial(i)) {
            return false;
        }
    }
    return true;
}

function _canMergeGroup(list: MeshRenderer[]): boolean {
    const first = list[0];
    if (!first?.mesh) {
        return false;
    }
    for (let i = 1; i < list.length; i++) {
        if (!first.mesh.validateMergingMesh(list[i].mesh!)) {
            return false;
        }
        if (!_sameMaterials(first, list[i])) {
            return false;
        }
    }
    return true;
}

/**
 * 将同一网格 + 同一材质的一组 MeshRenderer 合并为一个 Mesh（类似 Unity Static Batching）。
 * 原 Renderer 会被 disable，节点层级保留。
 */
export function batchMeshRendererGroup(
    renderers: MeshRenderer[],
    batchedRoot: Node,
    spaceRoot: Node,
): boolean {
    if (renderers.length < 2 || !_canMergeGroup(renderers)) {
        return false;
    }

    const batchedMesh = new Mesh();
    const worldMat = new Mat4();
    const rootWorldMatInv = new Mat4();
    spaceRoot.getWorldMatrix(rootWorldMatInv);
    Mat4.invert(rootWorldMatInv, rootWorldMatInv);

    for (const comp of renderers) {
        comp.node.getWorldMatrix(worldMat);
        Mat4.multiply(worldMat, rootWorldMatInv, worldMat);
        batchedMesh.merge(comp.mesh!, worldMat);
        comp.enabled = false;
    }

    const batchedModel = batchedRoot.addComponent(MeshRenderer);
    batchedModel.mesh = batchedMesh;
    batchedModel.sharedMaterials = renderers[0].sharedMaterials;
    return true;
}

/**
 * 对 root 下所有可合并的静态网格分组合批，合批节点挂到 outputParent。
 * spaceRoot 一般为 Island，保证合并后世界坐标正确。
 */
export function batchStaticMeshesUnder(
    root: Node,
    outputParent: Node,
    spaceRoot: Node,
): StaticBatchResult {
    const renderers = root.getComponentsInChildren(MeshRenderer).filter(
        (r) => r.enabled && r.node.activeInHierarchy && r.mesh,
    );

    const groups = new Map<string, MeshRenderer[]>();
    for (const renderer of renderers) {
        const mesh = renderer.mesh!;
        const mat = renderer.getRenderMaterial(0);
        const key = `${mesh.uuid}|${mat?.uuid ?? 'none'}`;
        const list = groups.get(key) ?? [];
        list.push(renderer);
        groups.set(key, list);
    }

    let batches = 0;
    let mergedRenderers = 0;
    let batchIndex = 0;

    for (const list of groups.values()) {
        if (list.length < 2) {
            continue;
        }

        const batchNode = new Node(`${root.name}_Batch_${batchIndex}`);
        batchIndex += 1;
        batchNode.setParent(outputParent);

        if (batchMeshRendererGroup(list, batchNode, spaceRoot)) {
            batches += 1;
            mergedRenderers += list.length;
        } else {
            batchNode.destroy();
        }
    }

    return { batches, mergedRenderers };
}
