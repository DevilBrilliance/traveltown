import { gfx, ImageAsset, Texture2D } from 'cc';

/** 5×7 点阵，行优先；用于贴地价格数字，无 Label / RenderRoot2D */
const GLYPH_ORDER = '0123456789+';
const GLYPH_PATTERNS: Record<string, string> = {
    '0': '11111' + '10001' + '10001' + '10001' + '10001' + '10001' + '11111',
    '1': '00100' + '01100' + '00100' + '00100' + '00100' + '00100' + '01110',
    '2': '11111' + '00001' + '00001' + '11111' + '10000' + '10000' + '11111',
    '3': '11111' + '00001' + '00001' + '01111' + '00001' + '00001' + '11111',
    '4': '10001' + '10001' + '10001' + '11111' + '00001' + '00001' + '00001',
    '5': '11111' + '10000' + '10000' + '11111' + '00001' + '00001' + '11111',
    '6': '11111' + '10000' + '10000' + '11111' + '10001' + '10001' + '11111',
    '7': '11111' + '00001' + '00001' + '00010' + '00100' + '01000' + '01000',
    '8': '11111' + '10001' + '10001' + '11111' + '10001' + '10001' + '11111',
    '9': '11111' + '10001' + '10001' + '11111' + '00001' + '00001' + '11111',
    '+': '00000' + '00100' + '00100' + '11111' + '00100' + '00100' + '00000',
};

const GLYPH_COLS = 5;
const GLYPH_ROWS = 7;
const CELL_W = 10;
const CELL_H = 12;
const TEX_W = GLYPH_ORDER.length * CELL_W;
const TEX_H = CELL_H;

export interface GlyphUv {
    u0: number;
    v0: number;
    u1: number;
    v1: number;
}

/** 全局共享数字图集（1 张纹理，所有购买区共用） */
export class GroundDigitAtlas {
    private static _instance: GroundDigitAtlas | null = null;

    public readonly texture: Texture2D;
    private readonly _uvByChar = new Map<string, GlyphUv>();

    private constructor() {
        const pixels = new Uint8Array(TEX_W * TEX_H * 4);
        for (let i = 0; i < GLYPH_ORDER.length; i++) {
            const ch = GLYPH_ORDER[i]!;
            this._uvByChar.set(ch, this._uvForIndex(i));
            this._drawGlyph(pixels, ch, i * CELL_W, 0);
        }

        const image = new ImageAsset();
        image.reset({
            _data: pixels,
            width: TEX_W,
            height: TEX_H,
            format: gfx.Format.RGBA8,
            _compressed: false,
        });

        this.texture = new Texture2D();
        this.texture.reset({
            width: TEX_W,
            height: TEX_H,
            format: gfx.Format.RGBA8,
        });
        this.texture.image = image;
        this.texture.uploadData(pixels);
    }

    public static get shared(): GroundDigitAtlas {
        if (!GroundDigitAtlas._instance) {
            GroundDigitAtlas._instance = new GroundDigitAtlas();
        }
        return GroundDigitAtlas._instance;
    }

    public getUv(char: string): GlyphUv {
        return this._uvByChar.get(char) ?? this._uvForIndex(0);
    }

    private _uvForIndex(index: number): GlyphUv {
        const u0 = (index * CELL_W) / TEX_W;
        const u1 = ((index + 1) * CELL_W) / TEX_W;
        return { u0, v0: 0, u1, v1: 1 };
    }

    private _drawGlyph(pixels: Uint8Array, char: string, ox: number, oy: number): void {
        const pattern = GLYPH_PATTERNS[char];
        if (!pattern) {
            return;
        }
        for (let row = 0; row < GLYPH_ROWS; row++) {
            for (let col = 0; col < GLYPH_COLS; col++) {
                if (pattern[row * GLYPH_COLS + col] !== '1') {
                    continue;
                }
                const px = ox + col + 2;
                const py = oy + row + 2;
                const idx = (py * TEX_W + px) * 4;
                pixels[idx] = 255;
                pixels[idx + 1] = 255;
                pixels[idx + 2] = 255;
                pixels[idx + 3] = 255;
            }
        }
    }
}
