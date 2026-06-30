import {
    _decorator,
    Component,
    instantiate,
    Node,
    Prefab,
    resources,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

const MAIN_UI_PREFAB_PATH = 'prefabs/MainUI';

/**
 * 场景主逻辑入口，默认自动创建 MainUI。
 * 挂到场景根下的 Main 节点即可。
 */
@ccclass('MainCtrl')
export class MainCtrl extends Component {
    @property({ tooltip: '启动时自动创建 MainUI' })
    autoCreateMainUI = true;

    private _mainUINode: Node | null = null;

    onLoad() {
        if (this.autoCreateMainUI) {
            this.createMainUI();
        }
    }

    /** 创建主界面（已存在则跳过） */
    public createMainUI(): void {
        if (this._mainUINode?.isValid) {
            return;
        }

        const sceneRoot = this.node.parent;
        const existing = sceneRoot?.getChildByName('MainUI');
        if (existing) {
            this._mainUINode = existing;
            return;
        }

        resources.load(MAIN_UI_PREFAB_PATH, Prefab, (err, prefab) => {
            if (err || !prefab) {
                console.error('[MainCtrl] MainUI 预制体加载失败', err);
                return;
            }
            this._spawnMainUI(prefab);
        });
    }

    private _spawnMainUI(prefab: Prefab): void {
        const node = instantiate(prefab);
        node.name = 'MainUI';
        node.setPosition(Vec3.ZERO);

        const parent = this.node.parent ?? this.node;
        node.parent = parent;
        node.setSiblingIndex(parent.children.length - 1);

        this._mainUINode = node;
    }
}
