import {
    _decorator,
    Component,
    director,
    Node,
    Prefab,
    Vec3,
} from 'cc';
import { AppearanceController } from '../character/AppearanceController';
import { CharacterAppearanceType } from '../character/CharacterAppearanceType';
import { PlayerMovementController } from '../character/PlayerMovementController';
import { CameraFollowController } from '../camera/CameraFollowController';

const { ccclass, property } = _decorator;

/**
 * 游戏开始入口：启动时在指定位置创建主角（NPC_RIG / nv2）。
 * 请在编辑器中手动挂到场景节点（如 Main 或场景根下的 Game 节点）。
 */
@ccclass('GameStart')
export class GameStart extends Component {
    @property({ tooltip: '进入场景后自动开始游戏' })
    autoStart = true;

    @property({ tooltip: '主角世界坐标生成位置' })
    spawnPosition = new Vec3(0, 0, 0);

    @property({ type: Prefab, tooltip: '可选：拖入 resources/characters/NPC_RIG，加载失败时用此引用' })
    protagonistPrefab: Prefab | null = null;

    private _protagonist: Node | null = null;

    onLoad() {
        if (this.autoStart) {
            this.startGame();
        }
    }

    /** 开始游戏并创建主角 */
    public startGame(): void {
        if (this._protagonist?.isValid) {
            return;
        }

        const parent = this._getSpawnParent();
        AppearanceController.create(
            parent,
            CharacterAppearanceType.Protagonist,
            (_controller, characterNode) => {
                characterNode.name = 'Protagonist';
                characterNode.setWorldPosition(this.spawnPosition);
                characterNode.addComponent(PlayerMovementController);
                CameraFollowController.bindMainCamera(characterNode, true);
                this._protagonist = characterNode;
            },
            this.protagonistPrefab,
        );
    }

    public get protagonist(): Node | null {
        return this._protagonist;
    }

    private _getSpawnParent(): Node {
        return this.node.parent ?? director.getScene()!;
    }
}
