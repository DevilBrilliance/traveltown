import {
    _decorator,
    assetManager,
    Component,
    Enum,
    instantiate,
    MeshRenderer,
    Node,
    Prefab,
    resources,
    SkinnedMeshRenderer,
    Texture2D,
} from 'cc';
import {
    BODY_NODE_NAMES,
    CharacterAppearanceType,
    CUSTOMER_TEXTURE_PATHS,
    NPC_RIG_PREFAB_PATH,
    NPC_RIG_PREFAB_UUID,
    PROP_NODE_NAMES,
} from './CharacterAppearanceType';

const { ccclass, property } = _decorator;

type BodyNodeKey = typeof BODY_NODE_NAMES[number];
type PropNodeKey = typeof PROP_NODE_NAMES[number];

/**
 * 形象控制器
 * 挂载在 NPC_RIG 根节点，通过 Geometry 子节点显隐切换形象。
 */
@ccclass('AppearanceController')
export class AppearanceController extends Component {
    @property({ type: Node, tooltip: 'Geometry 节点，不填则自动查找' })
    geometryRoot: Node | null = null;

    @property({ type: Enum(CharacterAppearanceType), tooltip: '默认形象' })
    defaultAppearance: CharacterAppearanceType = CharacterAppearanceType.Protagonist;

    private _geometry: Node | null = null;
    private _bodyNodes = new Map<BodyNodeKey, Node>();
    private _propNodes = new Map<PropNodeKey, Node>();
    private _currentAppearance: CharacterAppearanceType = CharacterAppearanceType.Protagonist;
    private _nan2DefaultTexture: Texture2D | null = null;
    private _customerTextures = new Map<CharacterAppearanceType, Texture2D>();
    private _duckVisible = false;
    private _duckVariant: 1 | 2 = 2;
    private _sickleVisible = false;
    private _initialized = false;

    public get currentAppearance(): CharacterAppearanceType {
        return this._currentAppearance;
    }

    public get isDuckVisible(): boolean {
        return this._duckVisible;
    }

    public get isSickleVisible(): boolean {
        return this._sickleVisible;
    }

    onLoad() {
        this._initialize();
    }

    /**
     * 根据枚举创建 NPC_RIG 角色
     * @param prefabOverride 可选，编辑器拖入的 Prefab 优先使用
     */
    public static create(
        parent: Node,
        appearance: CharacterAppearanceType,
        onCreated?: (controller: AppearanceController, characterNode: Node) => void,
        prefabOverride?: Prefab | null,
    ): void {
        if (prefabOverride) {
            AppearanceController._spawn(parent, appearance, prefabOverride, onCreated);
            return;
        }

        AppearanceController._loadNpcRigPrefab((prefab) => {
            AppearanceController._spawn(parent, appearance, prefab, onCreated);
        }, (err) => {
            console.error('[AppearanceController] NPC_RIG 加载失败', err);
        });
    }

    private static _loadNpcRigPrefab(
        onLoaded: (prefab: Prefab) => void,
        onError: (err: Error) => void,
    ): void {
        resources.load(NPC_RIG_PREFAB_PATH, Prefab, (err, prefab) => {
            if (!err && prefab) {
                onLoaded(prefab);
                return;
            }

            // loadAny 第二参数是回调，不能传 Prefab 类型，否则会报 "cannot be invoked without 'new'"
            assetManager.loadAny({ uuid: NPC_RIG_PREFAB_UUID, type: Prefab }, (err2, asset) => {
                if (err2 || !asset) {
                    onError(err2 ?? err ?? new Error('NPC_RIG not found'));
                    return;
                }
                onLoaded(asset as Prefab);
            });
        });
    }

    private static _spawn(
        parent: Node,
        appearance: CharacterAppearanceType,
        prefab: Prefab,
        onCreated?: (controller: AppearanceController, characterNode: Node) => void,
    ): void {
        const characterNode = instantiate(prefab);
        parent.addChild(characterNode);

        const controller = characterNode.getComponent(AppearanceController)
            ?? characterNode.addComponent(AppearanceController);
        controller.setAppearance(appearance);
        onCreated?.(controller, characterNode);
    }

    /** 切换形象 */
    public setAppearance(appearance: CharacterAppearanceType): void {
        if (!this._ensureInitialized()) {
            this.scheduleOnce(() => this.setAppearance(appearance), 0);
            return;
        }

        this._currentAppearance = appearance;
        this._hideAllBodies();

        switch (appearance) {
            case CharacterAppearanceType.Protagonist:
                this._showBody('nv2');
                break;
            case CharacterAppearanceType.WorkerNan2:
                this._showBody('nan2');
                this._restoreNan2DefaultTexture();
                break;
            case CharacterAppearanceType.WorkerNv1:
                this._showBody('nv1');
                break;
            case CharacterAppearanceType.Customer0:
                this._showBody('nan2');
                this._applyCustomerTexture(CharacterAppearanceType.Customer0);
                break;
            case CharacterAppearanceType.Customer1:
                this._showBody('nan2');
                this._applyCustomerTexture(CharacterAppearanceType.Customer1);
                break;
            default:
                break;
        }

        this._applyPropVisibility();
        this.node.emit('appearance-changed', appearance);
    }

    /** 开启/关闭鸭子（variant: 1=Duck01, 2=Duck02） */
    public setDuckVisible(visible: boolean, variant: 1 | 2 = 2): void {
        this._duckVisible = visible;
        this._duckVariant = variant;
        this._applyPropVisibility();
    }

    /** 开启鸭子 */
    public enableDuck(variant: 1 | 2 = 2): void {
        this.setDuckVisible(true, variant);
    }

    /** 关闭鸭子 */
    public disableDuck(): void {
        this.setDuckVisible(false);
    }

    /** 开启/关闭镰刀 */
    public setSickleVisible(visible: boolean): void {
        this._sickleVisible = visible;
        this._applyPropVisibility();
    }

    /** 开启镰刀 */
    public enableSickle(): void {
        this.setSickleVisible(true);
    }

    /** 关闭镰刀 */
    public disableSickle(): void {
        this.setSickleVisible(false);
    }

    private _ensureInitialized(): boolean {
        if (!this._initialized) {
            this._initialize();
        }
        return this._initialized;
    }

    private _initialize(): void {
        this._geometry = this.geometryRoot ?? this._findNodeByName(this.node, 'Geometry');
        if (!this._geometry) {
            console.warn('[AppearanceController] 未找到 Geometry 节点');
            return;
        }

        this._cacheNodes();
        this._cacheNan2DefaultTexture();
        this._preloadCustomerTextures();

        this._hideAllBodies();
        this._hideAllProps();
        this._initialized = true;
        this.setAppearance(this.defaultAppearance);
    }

    private _cacheNodes(): void {
        this._bodyNodes.clear();
        this._propNodes.clear();

        for (const name of BODY_NODE_NAMES) {
            const node = this._findNodeByName(this._geometry!, name);
            if (node) {
                this._bodyNodes.set(name, node);
            } else {
                console.warn(`[AppearanceController] 未找到身体节点: ${name}`);
            }
        }

        for (const name of PROP_NODE_NAMES) {
            const node = this._findNodeByName(this._geometry!, name);
            if (node) {
                this._propNodes.set(name, node);
            } else {
                console.warn(`[AppearanceController] 未找到道具节点: ${name}`);
            }
        }
    }

    private _cacheNan2DefaultTexture(): void {
        const nan2 = this._bodyNodes.get('nan2');
        if (!nan2 || nan2.children.length <= 1) {
            return;
        }

        const renderer = this._getRenderer(nan2.children[1]);
        if (!renderer) {
            return;
        }

        const material = renderer.getMaterialInstance(0);
        this._nan2DefaultTexture = material?.getProperty('mainTexture') as Texture2D | null;
    }

    private _preloadCustomerTextures(): void {
        const bundle = assetManager.getBundle('main') ?? assetManager.main;
        if (!bundle) {
            return;
        }

        const customerTypes = [CharacterAppearanceType.Customer0, CharacterAppearanceType.Customer1] as const;
        for (const type of customerTypes) {
            const path = CUSTOMER_TEXTURE_PATHS[type];
            bundle.load(`${path}/texture`, Texture2D, (err, texture) => {
                if (err || !texture) {
                    console.warn(`[AppearanceController] 顾客贴图加载失败: ${path}`, err);
                    return;
                }
                this._customerTextures.set(type, texture);
                if (this._currentAppearance === type) {
                    this._applyCustomerTexture(type);
                }
            });
        }
    }

    private _hideAllBodies(): void {
        for (const node of this._bodyNodes.values()) {
            node.active = false;
        }
    }

    private _hideAllProps(): void {
        for (const node of this._propNodes.values()) {
            node.active = false;
        }
    }

    private _showBody(name: BodyNodeKey): void {
        const node = this._bodyNodes.get(name);
        if (node) {
            node.active = true;
        }
    }

    private _applyPropVisibility(): void {
        const duck01 = this._propNodes.get('duck01');
        const duck02 = this._propNodes.get('duck02');
        const sickle = this._propNodes.get('ld');

        if (duck01) {
            duck01.active = this._duckVisible && this._duckVariant === 1;
        }
        if (duck02) {
            duck02.active = this._duckVisible && this._duckVariant === 2;
        }
        if (sickle) {
            sickle.active = this._sickleVisible;
        }
    }

    private _restoreNan2DefaultTexture(): void {
        if (!this._nan2DefaultTexture) {
            return;
        }
        this._setNan2ChildTexture(this._nan2DefaultTexture);
    }

    private _applyCustomerTexture(type: CharacterAppearanceType.Customer0 | CharacterAppearanceType.Customer1): void {
        const cached = this._customerTextures.get(type);
        if (cached) {
            this._setNan2ChildTexture(cached);
            return;
        }

        const bundle = assetManager.getBundle('main') ?? assetManager.main;
        if (!bundle) {
            return;
        }

        const path = CUSTOMER_TEXTURE_PATHS[type];
        bundle.load(`${path}/texture`, Texture2D, (err, texture) => {
            if (err || !texture) {
                console.warn(`[AppearanceController] 顾客贴图加载失败: ${path}`, err);
                return;
            }
            this._customerTextures.set(type, texture);
            if (this._currentAppearance === type) {
                this._setNan2ChildTexture(texture);
            }
        });
    }

    /** 切换 nan2 子节点 1 的材质 BaseColorMap（mainTexture） */
    private _setNan2ChildTexture(texture: Texture2D): void {
        const nan2 = this._bodyNodes.get('nan2');
        if (!nan2 || nan2.children.length <= 1) {
            console.warn('[AppearanceController] nan2 子节点 1 不存在，无法替换贴图');
            return;
        }

        const renderer = this._getRenderer(nan2.children[1]);
        if (!renderer) {
            console.warn('[AppearanceController] nan2 子节点 1 未找到 MeshRenderer');
            return;
        }

        const material = renderer.getMaterialInstance(0);
        if (!material) {
            console.warn('[AppearanceController] nan2 子节点 1 材质获取失败');
            return;
        }

        material.setProperty('mainTexture', texture);
    }

    private _getRenderer(node: Node): MeshRenderer | SkinnedMeshRenderer | null {
        return node.getComponent(SkinnedMeshRenderer) ?? node.getComponent(MeshRenderer);
    }

    private _findNodeByName(root: Node, name: string): Node | null {
        const target = name.toLowerCase();
        const stack: Node[] = [root];
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (current.name.toLowerCase() === target) {
                return current;
            }
            for (let i = current.children.length - 1; i >= 0; i -= 1) {
                stack.push(current.children[i]);
            }
        }
        return null;
    }
}
