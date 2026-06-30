import {
    _decorator,
    Camera,
    Color,
    Component,
    director,
    Label,
    Layers,
    Mat4,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
} from 'cc';
import { CurrencyCost } from '../../currency/CurrencyType';
import { BUBBLE_BG_PATH, BUBBLE_ICON_PATHS } from './BubbleIconPaths';

const { ccclass, property } = _decorator;

export interface BubbleShowOptions {
    /** 不填则自动生成 */
    id?: string;
    /** 跟随目标 */
    target: Node;
    /** 相对目标本地坐标偏移（默认头顶） */
    localOffset?: Vec3;
    /** 需求列表：icon + x 数量 */
    items: CurrencyCost[];
}

interface BubbleEntry {
    id: string;
    target: Node;
    localOffset: Vec3;
    root: Node;
    items: CurrencyCost[];
}

/**
 * 屏幕空间气泡：3D 本地锚点 → 世界 → Canvas UI 坐标。
 */
@ccclass('SpeechBubbleManager')
export class SpeechBubbleManager extends Component {
    private static _instance: SpeechBubbleManager | null = null;

    public static get instance(): SpeechBubbleManager | null {
        return SpeechBubbleManager._instance;
    }

    public static ensure(): SpeechBubbleManager {
        if (SpeechBubbleManager._instance) {
            return SpeechBubbleManager._instance;
        }
        const canvas = director.getScene()?.getChildByName('mainCanvas');
        const host = canvas ?? director.getScene()!;
        return host.getComponent(SpeechBubbleManager) ?? host.addComponent(SpeechBubbleManager);
    }

    @property({ type: Camera, tooltip: '3D 主相机，不填则查找 Main Camera' })
    worldCamera: Camera | null = null;

    @property({ tooltip: '相对目标本地坐标（头顶）' })
    defaultLocalOffset = new Vec3(0, 2.1, 0);

    @property({ tooltip: 'icon 边长（UI 像素）' })
    iconSize = 52;

    @property({ tooltip: '数量字号' })
    countFontSize = 28;

    private readonly _bubbles = new Map<string, BubbleEntry>();
    private readonly _frameCache = new Map<string, SpriteFrame>();
    private readonly _worldMat = new Mat4();
    private readonly _worldPos = new Vec3();
    private readonly _uiPos = new Vec3();
    private _canvasUi: UITransform | null = null;
    private _seq = 0;

    onLoad() {
        if (SpeechBubbleManager._instance && SpeechBubbleManager._instance !== this) {
            this.node.destroy();
            return;
        }
        SpeechBubbleManager._instance = this;
        this._canvasUi = this.node.getComponent(UITransform);
        this._preloadFrames();
    }

    onDestroy() {
        if (SpeechBubbleManager._instance === this) {
            SpeechBubbleManager._instance = null;
        }
    }

    lateUpdate() {
        this._updateBubblePositions();
    }

    public show(options: BubbleShowOptions): string {
        const id = options.id ?? `bubble_${++this._seq}`;
        const items = options.items.filter((item) => item.amount > 0);
        if (!options.target?.isValid || items.length === 0) {
            this.hide(id);
            return id;
        }

        const localOffset = options.localOffset ?? this.defaultLocalOffset;
        let entry = this._bubbles.get(id);
        if (!entry) {
            const root = this._createBubbleNode(items);
            entry = {
                id,
                target: options.target,
                localOffset,
                root,
                items,
            };
            this._bubbles.set(id, entry);
        } else {
            entry.target = options.target;
            entry.localOffset = localOffset;
            entry.items = items;
            this._rebuildBubbleContent(entry.root, items);
            entry.root.active = true;
        }

        this._updateEntryPosition(entry);
        return id;
    }

    public showOnTarget(
        id: string,
        target: Node,
        items: CurrencyCost[],
        localOffset?: Vec3,
    ): string {
        return this.show({ id, target, items, localOffset });
    }

    public hide(id: string): void {
        const entry = this._bubbles.get(id);
        if (!entry) {
            return;
        }
        entry.root.destroy();
        this._bubbles.delete(id);
    }

    public hideAll(): void {
        for (const id of [...this._bubbles.keys()]) {
            this.hide(id);
        }
    }

    public isVisible(id: string): boolean {
        const entry = this._bubbles.get(id);
        return !!entry?.root.isValid && entry.root.active;
    }

    private _resolveCamera(): Camera | null {
        if (this.worldCamera?.isValid) {
            return this.worldCamera;
        }
        const scene = director.getScene();
        this.worldCamera = scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
        return this.worldCamera;
    }

    private _preloadFrames(): void {
        this._loadFrame(BUBBLE_BG_PATH, () => this._refreshAllIcons());
        for (const path of Object.values(BUBBLE_ICON_PATHS)) {
            this._loadFrame(path, () => this._refreshAllIcons());
        }
    }

    private _loadFrame(path: string, onLoaded?: () => void): void {
        if (this._frameCache.has(path)) {
            return;
        }
        resources.load(`${path}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (!err && frame) {
                this._frameCache.set(path, frame);
                onLoaded?.();
            }
        });
    }

    private _getFrame(path: string): SpriteFrame | null {
        return this._frameCache.get(path) ?? null;
    }

    private _refreshAllIcons(): void {
        for (const entry of this._bubbles.values()) {
            this._rebuildBubbleContent(entry.root, entry.items);
        }
    }

    private _createBubbleNode(items: CurrencyCost[]): Node {
        const root = new Node('SpeechBubble');
        root.layer = Layers.Enum.UI_2D;
        root.parent = this.node;

        const rootUi = root.addComponent(UITransform);
        rootUi.setAnchorPoint(0.5, 0.5);

        const bg = new Node('Bg');
        bg.layer = Layers.Enum.UI_2D;
        bg.parent = root;
        bg.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
        const bgSprite = bg.addComponent(Sprite);
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const bgFrame = this._getFrame(BUBBLE_BG_PATH);
        if (bgFrame) {
            bgSprite.spriteFrame = bgFrame;
        }

        const content = new Node('Content');
        content.layer = Layers.Enum.UI_2D;
        content.parent = root;
        content.addComponent(UITransform).setAnchorPoint(0.5, 0.5);

        this._rebuildBubbleContent(root, items);
        return root;
    }

    private _rebuildBubbleContent(root: Node, items: CurrencyCost[]): void {
        const content = root.getChildByName('Content');
        const bg = root.getChildByName('Bg');
        if (!content || !bg) {
            return;
        }

        content.removeAllChildren();

        const gap = 8;
        const rowH = this.iconSize;
        let totalW = 0;
        const itemNodes: Node[] = [];

        for (const item of items) {
            const row = this._createItemRow(item);
            itemNodes.push(row);
            totalW += row.getComponent(UITransform)!.width;
        }
        totalW += gap * Math.max(0, itemNodes.length - 1);

        let cursorX = -totalW * 0.5;
        for (const row of itemNodes) {
            const rowUi = row.getComponent(UITransform)!;
            row.parent = content;
            row.setPosition(cursorX + rowUi.width * 0.5, 0, 0);
            cursorX += rowUi.width + gap;
        }

        const padX = 24;
        const padY = 16;
        const bgW = totalW + padX * 2;
        const bgH = rowH + padY * 2;
        bg.getComponent(UITransform)!.setContentSize(bgW, bgH);
        root.getComponent(UITransform)!.setContentSize(bgW, bgH);
    }

    private _createItemRow(item: CurrencyCost): Node {
        const row = new Node('Item');
        row.layer = Layers.Enum.UI_2D;

        const iconPath = BUBBLE_ICON_PATHS[item.type];
        const iconNode = new Node('Icon');
        iconNode.layer = Layers.Enum.UI_2D;
        iconNode.parent = row;
        const iconUi = iconNode.addComponent(UITransform);
        iconUi.setContentSize(this.iconSize, this.iconSize);
        iconUi.setAnchorPoint(0.5, 0.5);
        const iconSprite = iconNode.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const iconFrame = this._getFrame(iconPath);
        if (iconFrame) {
            iconSprite.spriteFrame = iconFrame;
        }

        const labelNode = new Node('Count');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.parent = row;
        const labelUi = labelNode.addComponent(UITransform);
        labelUi.setAnchorPoint(0, 0.5);
        const label = labelNode.addComponent(Label);
        const text = `x ${item.amount}`;
        label.string = text;
        label.fontSize = this.countFontSize;
        label.lineHeight = this.countFontSize + 4;
        label.color = new Color(40, 40, 40, 255);
        label.isBold = true;

        const labelW = Math.max(40, text.length * (this.countFontSize * 0.55));
        labelUi.setContentSize(labelW, this.iconSize);
        const rowW = this.iconSize + 4 + labelW;
        row.addComponent(UITransform).setContentSize(rowW, this.iconSize);
        iconNode.setPosition(-rowW * 0.5 + this.iconSize * 0.5, 0, 0);
        labelNode.setPosition(-rowW * 0.5 + this.iconSize + 4, 0, 0);

        return row;
    }

    private _computeWorldAnchor(entry: BubbleEntry): void {
        entry.target.getWorldMatrix(this._worldMat);
        Vec3.transformMat4(this._worldPos, entry.localOffset, this._worldMat);
    }

    private _updateBubblePositions(): void {
        for (const entry of this._bubbles.values()) {
            if (!entry.target?.isValid) {
                entry.root.active = false;
                continue;
            }
            this._updateEntryPosition(entry);
        }
    }

    private _updateEntryPosition(entry: BubbleEntry): void {
        const camera = this._resolveCamera();
        if (!camera || !this._canvasUi) {
            return;
        }

        this._computeWorldAnchor(entry);
        // 必须转换到 Canvas 根节点（mainCanvas），不能转到无尺寸的中间层
        camera.convertToUINode(this._worldPos, this.node, this._uiPos);
        entry.root.setPosition(this._uiPos.x, this._uiPos.y, 0);

        const inFront = this._uiPos.z >= 0;
        entry.root.active = inFront && entry.target.activeInHierarchy;
    }
}
