import {
    _decorator,
    Camera,
    Component,
    director,
    instantiate,
    Layers,
    Mat4,
    Node,
    Prefab,
    resources,
    SpriteFrame,
    UITransform,
    Vec3,
} from 'cc';
import { CurrencyCost, CurrencyType } from '../../currency/CurrencyType';
import { BUBBLE_ICON_PATHS, SPEECH_BUBBLE_PREFAB_PATH } from './BubbleIconPaths';
import { SpeechBubbleView } from './SpeechBubbleView';

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
    view: SpeechBubbleView;
    items: CurrencyCost[];
}

/**
 * 屏幕空间气泡：实例化 SpeechBubble 预制体，3D 锚点 → Canvas UI 坐标。
 * 样式请在 resources/prefabs/SpeechBubble 预制体中调整。
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
        const scene = director.getScene();
        const canvas = scene?.getChildByName('mainCanvas');
        const host = canvas
            ?? scene?.getChildByName('start')
            ?? scene?.getChildByName('Island');
        if (!host) {
            throw new Error('[SpeechBubbleManager] 未找到可挂载 UI 的节点');
        }
        return host.getComponent(SpeechBubbleManager) ?? host.addComponent(SpeechBubbleManager);
    }

    @property({ type: Camera, tooltip: '3D 主相机，不填则查找 Main Camera' })
    worldCamera: Camera | null = null;

    @property({ type: Prefab, tooltip: '气泡预制体，不填则自动加载 SpeechBubble' })
    bubblePrefab: Prefab | null = null;

    @property({ tooltip: '相对目标本地坐标（头顶）' })
    defaultLocalOffset = new Vec3(0, 2.1, 0);

    private readonly _bubbles = new Map<string, BubbleEntry>();
    private readonly _frameCache = new Map<string, SpriteFrame>();
    private readonly _worldMat = new Mat4();
    private readonly _worldPos = new Vec3();
    private readonly _uiPos = new Vec3();
    private _canvasUi: UITransform | null = null;
    private _seq = 0;
    private _prefabLoading = false;
    private readonly _prefabWaiters: Array<() => void> = [];

    onLoad() {
        if (SpeechBubbleManager._instance && SpeechBubbleManager._instance !== this) {
            this.node.destroy();
            return;
        }
        SpeechBubbleManager._instance = this;
        this._canvasUi = this.node.getComponent(UITransform);
        this._preloadIconFrames();
        this._ensureBubblePrefab();
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
            if (!root) {
                return id;
            }
            const view = root.getComponent(SpeechBubbleView)!;
            entry = {
                id,
                target: options.target,
                localOffset,
                root,
                view,
                items,
            };
            this._bubbles.set(id, entry);
        } else {
            entry.target = options.target;
            entry.localOffset = localOffset;
            entry.items = items;
            entry.view.applyItems(items, (path) => this._getFrame(path));
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

    private _ensureBubblePrefab(onReady?: () => void): void {
        if (this.bubblePrefab) {
            onReady?.();
            return;
        }
        if (onReady) {
            this._prefabWaiters.push(onReady);
        }
        if (this._prefabLoading) {
            return;
        }
        this._prefabLoading = true;
        resources.load(SPEECH_BUBBLE_PREFAB_PATH, Prefab, (err, prefab) => {
            this._prefabLoading = false;
            if (!err && prefab) {
                this.bubblePrefab = prefab;
            } else {
                console.warn('[SpeechBubbleManager] 加载 SpeechBubble 预制体失败', err);
            }
            const waiters = this._prefabWaiters.splice(0);
            for (const cb of waiters) {
                cb();
            }
        });
    }

    private _createBubbleNode(items: CurrencyCost[]): Node | null {
        if (!this.bubblePrefab) {
            this._ensureBubblePrefab();
            return null;
        }

        const root = instantiate(this.bubblePrefab);
        root.name = 'SpeechBubble';
        root.layer = Layers.Enum.UI_2D;
        root.parent = this.node;

        let view = root.getComponent(SpeechBubbleView);
        if (!view) {
            view = root.addComponent(SpeechBubbleView);
        }
        view.bindNodes();
        view.applyItems(items, (path) => this._getFrame(path));
        return root;
    }

    private _resolveCamera(): Camera | null {
        if (this.worldCamera?.isValid) {
            return this.worldCamera;
        }
        const scene = director.getScene();
        this.worldCamera = scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
        return this.worldCamera;
    }

    private _preloadIconFrames(): void {
        for (const type of [CurrencyType.PineappleJuice, CurrencyType.GoldCoin]) {
            this._loadFrame(BUBBLE_ICON_PATHS[type], () => this._refreshAllBubbles());
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

    private _refreshAllBubbles(): void {
        for (const entry of this._bubbles.values()) {
            entry.view.applyItems(entry.items, (path) => this._getFrame(path));
        }
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
        camera.convertToUINode(this._worldPos, this.node, this._uiPos);
        entry.root.setPosition(this._uiPos.x, this._uiPos.y, 0);

        const inFront = this._uiPos.z >= 0;
        entry.root.active = inFront && entry.target.activeInHierarchy;
    }
}
