import {
    Color,
    gfx,
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
    /** 8 个数：bl, br, tr, tl 的 u,v */
    cornerUvs: number[];
}

const DEFAULT_CORNER_UVS = [0, 0, 1, 0, 1, 1, 0, 1];

export function uvCornersFromSpriteFrame(frame: SpriteFrame): number[] {
    const uv = frame.uv;
    if (uv && uv.length >= 8) {
        // Cocos SpriteFrame.uv 顺序：bl, br, tl, tr
        // 网格顶点顺序：bl, br, tr, tl
        return [uv[0], uv[1], uv[2], uv[3], uv[6], uv[7], uv[4], uv[5]];
    }
    const tex = frame.texture as Texture2D;
    const rect = frame.rect;
    const texW = tex.width;
    const texH = tex.height;
    const u0 = rect.x / texW;
    const v0 = rect.y / texH;
    const u1 = (rect.x + rect.width) / texW;
    const v1 = (rect.y + rect.height) / texH;
    return [u0, v1, u1, v1, u1, v0, u0, v0];
}

/**
 * 透明贴图材质（世界贴花）：
 * - 开 Alpha 混合，避免黑边
 * - 开深度测试并写深度，避免不同视角下透明排序抖动导致“样子变化”
 */
export function createUnlitMaterial(texture: Texture2D, color: Color): Material {
    const mat = new Material();
    mat.initialize({
        effectName: 'builtin-unlit',
        defines: { USE_TEXTURE: true },
        states: {
            rasterizerState: { cullMode: gfx.CullMode.NONE },
            depthStencilState: {
                depthTest: true,
                depthWrite: true,
                depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
            },
            blendState: {
                targets: [{
                    blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    blendEq: gfx.BlendOp.ADD,
                    blendSrcAlpha: gfx.BlendFactor.ONE,
                    blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    blendAlphaEq: gfx.BlendOp.ADD,
                }],
            },
        },
    });
    mat.setProperty('mainTexture', texture);
    mat.setProperty('mainColor', color);
    return mat;
}

function appendQuad(
    positions: number[],
    uvs: number[],
    indices: number[],
    cx: number,
    cy: number,
    width: number,
    height: number,
    cornerUvs: number[],
    vertexBase: number,
): void {
    const hw = width * 0.5;
    const hh = height * 0.5;
    positions.push(
        cx - hw, cy - hh, 0,
        cx + hw, cy - hh, 0,
        cx + hw, cy + hh, 0,
        cx - hw, cy + hh, 0,
    );
    for (let i = 0; i < 8; i++) {
        uvs.push(cornerUvs[i] ?? 0);
    }
    indices.push(
        vertexBase, vertexBase + 1, vertexBase + 2,
        vertexBase, vertexBase + 2, vertexBase + 3,
    );
}

export function buildMergedQuadMesh(specs: GroundQuadSpec[]) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexBase = 0;

    for (const spec of specs) {
        appendQuad(
            positions, uvs, indices,
            spec.cx, spec.cy, spec.width, spec.height,
            spec.cornerUvs.length >= 8 ? spec.cornerUvs : DEFAULT_CORNER_UVS,
            vertexBase,
        );
        vertexBase += 4;
    }

    return utils.MeshUtils.createMesh({ positions, uvs, indices });
}

export function addTexturedQuad(
    parent: Node,
    name: string,
    texture: Texture2D,
    width: number,
    height: number,
    localPos: { x: number; y: number },
    tint: Color,
    cornerUvs: number[] = DEFAULT_CORNER_UVS,
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
        cornerUvs,
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
