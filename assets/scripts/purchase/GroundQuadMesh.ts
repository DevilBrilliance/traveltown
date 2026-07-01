import {
    Color,
    Material,
    MeshRenderer,
    Node,
    SpriteFrame,
    Texture2D,
    utils,
} from 'cc';

export interface QuadUv {
    u0: number;
    v0: number;
    u1: number;
    v1: number;
}

export interface GroundQuadSpec {
    cx: number;
    cy: number;
    width: number;
    height: number;
    uv: QuadUv;
}

export function uvFromSpriteFrame(frame: SpriteFrame): QuadUv {
    const tex = frame.texture as Texture2D;
    const rect = frame.rect;
    const texW = tex.width;
    const texH = tex.height;
    return {
        u0: rect.x / texW,
        v0: rect.y / texH,
        u1: (rect.x + rect.width) / texW,
        v1: (rect.y + rect.height) / texH,
    };
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

export function buildMergedQuadMesh(specs: GroundQuadSpec[]) {
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

export function addTexturedQuad(
    parent: Node,
    name: string,
    texture: Texture2D,
    width: number,
    height: number,
    localPos: { x: number; y: number },
    tint: Color,
    uv: QuadUv = { u0: 0, v0: 0, u1: 1, v1: 1 },
    zOffset = 0,
): MeshRenderer {
    const node = new Node(name);
    node.setParent(parent);
    node.setPosition(localPos.x, localPos.y, zOffset);
    node.layer = parent.layer;

    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = buildMergedQuadMesh([{
        cx: 0,
        cy: 0,
        width: 1,
        height: 1,
        uv,
    }]);
    renderer.material = createUnlitMaterial(texture, tint);
    node.setScale(width, height, 1);
    return renderer;
}

export function addMergedTexturedQuads(
    parent: Node,
    name: string,
    specs: GroundQuadSpec[],
    texture: Texture2D,
    tint: Color,
    zOffset = 0,
): MeshRenderer {
    const node = new Node(name);
    node.setParent(parent);
    node.setPosition(0, 0, zOffset);
    node.layer = parent.layer;

    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = buildMergedQuadMesh(specs);
    renderer.material = createUnlitMaterial(texture, tint);
    return renderer;
}
