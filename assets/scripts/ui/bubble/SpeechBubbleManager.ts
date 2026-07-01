import {
    _decorator,
    Camera,
    Component,
    director,
    instantiate,
    Layers,
    Mat4,
    math,
    Node,
    Prefab,
    resources,
    SpriteFrame,
    UITransform,
    Vec3,
} from 'cc';
import { CurrencyCost, CurrencyType } from '../../currency/CurrencyType';
import { PlayAreaBoundary } from '../../scene/PlayAreaBoundary';
import { BUBBLE_ICON_PATHS, SPEECH_BUBBLE_PREFAB_PATH } from './BubbleIconPaths';
import { SpeechBubbleView } from './SpeechBubbleView';

const { ccclass, property } = _decorator;

export interface BubbleShowOptions {
    id?: string;
    target: Node;
    localOffset?: Vec3;
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
 * 屏幕空间气泡：脚底 pivot + 本地头顶偏移，按与主角距离近大远小，相机被挡则隐藏。
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

    @property({ type: Camera, tooltip: '3D 主相机（世界→UI 投影），不填则查找 Main Camera' })
    worldCamera: Camera | null = null;

    @property({ type: Node, tooltip: '主角节点，不填则查找 Protagonist' })
    protagonist: Node | null = null;

    @property({ type: Prefab, tooltip: '气泡预制体，不填则自动加载 SpeechBubble' })
    bubblePrefab: Prefab | null = null;

    @property({ tooltip: '相对目标本地坐标头顶偏移（脚底 pivot 时 Y≈4）' })
    defaultLocalOffset = new Vec3(0, 4, 0);

    @property({ tooltip: '参考主角距离，用于近大远小（距主角约此值时 scale≈1）' })
    referencePlayerDistance = 12;

    @property({ tooltip: '参考相机距离，用于抵消摄像机缩放对屏幕气泡大小的影响' })
    referenceCameraDistance = 28.14;

    @property({ tooltip: '气泡最小缩放' })
    minBubbleScale = 0.45;

    @property({ tooltip: '气泡最大缩放' })
    maxBubbleScale = 1.15;

    @property({ tooltip: '相对主角的最大可见距离（XZ），超过则隐藏' })
    maxVisibleDistance = 22;

    @property({ tooltip: '相机到头顶锚点被场景物体挡住时隐藏' })
    hideWhenCameraOccluded = true;

    @property({ tooltip: '遮挡检测终点预留距离（避免贴目标误判）' })
    cameraOcclusionMargin = 0.35;

    private readonly _bubbles = new Map<string, BubbleEntry>();
    private readonly _pendingShows: BubbleShowOptions[] = [];
    private readonly _frameCache = new Map<string, SpriteFrame>();
    private readonly _worldPos = new Vec3();
    private readonly _playerPos = new Vec3();
    private readonly _targetPos = new Vec3();
    private readonly _cameraPos = new Vec3();
    private readonly _uiPos = new Vec3();
    private readonly _worldMat = new Mat4();
    private readonly _headLocal = new Vec3();
    private readonly _occlusionIgnore: Node[] = [];
    private _bubbleLayer: Node | null = null;
    private _bubbleLayerUi: UITransform | null = null;
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
        this._ensureBubbleLayer();
        this._preloadIconFrames();
        this._ensureBubblePrefab(() => this._flushPendingShows());
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

        if (!this.bubblePrefab) {
            this._pendingShows.push({ ...options, id, items });
            this._ensureBubblePrefab(() => this._flushPendingShows());
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

    private _flushPendingShows(): void {
        if (!this.bubblePrefab || this._pendingShows.length === 0) {
            return;
        }
        const pending = this._pendingShows.splice(0);
        for (const opt of pending) {
            this.show(opt);
        }
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
            return null;
        }

        const root = instantiate(this.bubblePrefab);
        root.name = 'SpeechBubble';
        root.layer = Layers.Enum.UI_2D;
        root.parent = this._ensureBubbleLayer();

        const rootUi = root.getComponent(UITransform);
        if (rootUi) {
            rootUi.setAnchorPoint(0.5, 0);
        }

        let view = root.getComponent(SpeechBubbleView);
        if (!view) {
            view = root.addComponent(SpeechBubbleView);
        }
        view.bindNodes();
        view.applyItems(items, (path) => this._getFrame(path));
        return root;
    }

    private _resolveWorldCamera(): Camera | null {
        if (this.worldCamera?.isValid) {
            return this.worldCamera;
        }
        const scene = director.getScene();
        this.worldCamera = scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
        return this.worldCamera;
    }

    private _resolveProtagonist(): Node | null {
        if (this.protagonist?.isValid) {
            return this.protagonist;
        }
        const island = director.getScene()?.getChildByName('Island');
        this.protagonist = island?.getChildByName('Protagonist')
            ?? director.getScene()?.getChildByName('Protagonist')
            ?? null;
        return this.protagonist;
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

    private _ensureBubbleLayer(): Node {
        if (this._bubbleLayer?.isValid) {
            return this._bubbleLayer;
        }

        let layer = this.node.getChildByName('BubbleLayer');
        if (!layer) {
            layer = new Node('BubbleLayer');
            layer.layer = Layers.Enum.UI_2D;
            layer.parent = this.node;
            layer.setPosition(0, 0, 0);
        }

        const layerUi = layer.getComponent(UITransform)
            ?? layer.addComponent(UITransform);
        if (this._canvasUi) {
            layerUi.setContentSize(this._canvasUi.contentSize);
            layerUi.setAnchorPoint(0.5, 0.5);
        }

        this._bubbleLayer = layer;
        this._bubbleLayerUi = layerUi;
        layer.setSiblingIndex(this.node.children.length - 1);
        return layer;
    }

    /** 脚底 pivot：本地头顶偏移 → 世界坐标 */
    private _computeWorldAnchor(entry: BubbleEntry): void {
        Vec3.copy(this._headLocal, entry.localOffset);
        entry.target.getWorldMatrix(this._worldMat);
        Vec3.transformMat4(this._worldPos, this._headLocal, this._worldMat);
    }

    private _worldToBubbleLayerLocal(worldPos: Vec3, out: Vec3): boolean {
        const worldCam = this._resolveWorldCamera();
        const layer = this._bubbleLayer ?? this._ensureBubbleLayer();
        if (!worldCam) {
            return false;
        }

        worldCam.convertToUINode(worldPos, layer, out);
        return out.z >= 0;
    }

    /** 主角到目标根节点的 XZ 平面距离 */
    private _distanceToPlayerXZ(target: Node): number {
        target.getWorldPosition(this._targetPos);
        const dx = this._playerPos.x - this._targetPos.x;
        const dz = this._playerPos.z - this._targetPos.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    private _isCameraOccluded(camera: Camera, target: Node): boolean {
        if (!this.hideWhenCameraOccluded) {
            return false;
        }
        camera.node.getWorldPosition(this._cameraPos);
        this._occlusionIgnore.length = 0;
        this._occlusionIgnore.push(target);
        const player = this._resolveProtagonist();
        if (player) {
            this._occlusionIgnore.push(player);
        }
        return PlayAreaBoundary.instance?.isLineOccluded(
            this._cameraPos,
            this._worldPos,
            this.cameraOcclusionMargin,
            this._occlusionIgnore,
        ) ?? false;
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
        const player = this._resolveProtagonist();
        const worldCam = this._resolveWorldCamera();
        if (!player || !worldCam) {
            entry.root.active = false;
            return;
        }

        this._computeWorldAnchor(entry);
        player.getWorldPosition(this._playerPos);

        const playerDist = this._distanceToPlayerXZ(entry.target);
        if (playerDist > this.maxVisibleDistance) {
            entry.root.active = false;
            return;
        }

        if (!this._worldToBubbleLayerLocal(this._worldPos, this._uiPos)) {
            entry.root.active = false;
            return;
        }

        if (this._isCameraOccluded(worldCam, entry.target)) {
            entry.root.active = false;
            return;
        }

        entry.root.setPosition(this._uiPos.x, this._uiPos.y, 0);

        worldCam.node.getWorldPosition(this._cameraPos);
        const camDist = Vec3.distance(this._cameraPos, this._worldPos);
        const playerScale = this.referencePlayerDistance / Math.max(playerDist, 1);
        // 屏幕 UI 不随透视缩放，用相机距离补偿，使远近缩放只跟主角距离有关
        const cameraCompensation = this.referenceCameraDistance / Math.max(camDist, 0.5);
        let scale = playerScale * cameraCompensation;
        scale = math.clamp(scale, this.minBubbleScale, this.maxBubbleScale);
        entry.root.setScale(scale, scale, 1);

        entry.root.active = entry.target.activeInHierarchy;
    }
}
