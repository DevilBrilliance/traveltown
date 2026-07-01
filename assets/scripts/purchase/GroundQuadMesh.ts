import {
    Color,
    Material,
    MeshRenderer,
    Node,
    Texture2D,
    primitives,
    utils,
} from 'cc';
import { GlyphUv } from './GroundDigitAtlas';

export interface GroundQuadSpec {
    cx: number;
    cy: number;
    width: number;
    height: number;
    uv: GlyphUv;
}

export function createUnlitMaterial(texture: Texture2D, color: Color): Material {
    const mat = new Material();
    mat.initialize({
        effectName: 'builtin-unlit',
        defines: { USE_TEXTURE: true },
    });
    mat.setProperty('mainTexture', texture);
    mat.setProperty('mainColor', color);
    return mat;
}

/** 合并多个 quad 为单个 Mesh（同材质 → 1 DrawCall） */
export function buildMergedQuadMesh(specs: GroundQuadSpec[]): Mesh {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexBase = 0;

    for (const spec of specs) {
        const hw = spec.width * 0.5;
        const hh = spec.height * 0.5;
        const { cx, cy, uv } = spec;

        positions.push(
            cx - hw, cy - hh, 0,
            cx + hw, cy - hh, 0,
            cx + hw, cy + hh, 0,
            cx - hw, cy + hh, 0,
        );
        uvs.push(
            uv.u0, uv.v1,
            uv.u1, uv.v1,
            uv.u1, uv.v0,
            uv.u0, uv.v0,
        );
        indices.push(
            vertexBase, vertexBase + 1, vertexBase + 2,
            vertexBase, vertexBase + 2, vertexBase + 3,
        );
        vertexBase += 4;
    }

    return utils.MeshUtils.createMesh({
        positions,
        uvs,
        indices,
    });
}

/** 单 quad MeshRenderer（builtin-unlit，参与 3D 深度） */
export function addTexturedQuad(
    parent: Node,
    name: string,
    texture: Texture2D,
    width: number,
    height: number,
    localPos: { x: number; y: number },
    tint: Color,
): MeshRenderer {
    const node = new Node(name);
    node.setParent(parent);
    node.setPosition(localPos.x, localPos.y, 0);

    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.MeshUtils.createMesh(primitives.quad());
    renderer.material = createUnlitMaterial(texture, tint);
    node.setScale(width, height, 1);
    return renderer;
}

/** 多 quad 合并为单个 MeshRenderer */
export function addMergedTexturedQuads(
    parent: Node,
    name: string,
    specs: GroundQuadSpec[],
    texture: Texture2D,
    tint: Color,
): MeshRenderer {
    const node = new Node(name);
    node.setParent(parent);

    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = buildMergedQuadMesh(specs);
    renderer.material = createUnlitMaterial(texture, tint);
    return renderer;
}
