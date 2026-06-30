import {
    _decorator,
    Component,
    director,
    input,
    Input,
    KeyCode,
    Node,
    Vec3,
} from 'cc';
import { CurrencyType } from '../../currency/CurrencyType';
import { SpeechBubbleManager } from './SpeechBubbleManager';

const { ccclass, property } = _decorator;

const TEST_BUBBLE_ID = 'debug_player_bubble';

/** 深度查找场景节点 */
function findNodeByName(root: Node | null, name: string): Node | null {
    if (!root) {
        return null;
    }
    if (root.name === name) {
        return root;
    }
    for (const child of root.children) {
        const found = findNodeByName(child, name);
        if (found) {
            return found;
        }
    }
    return null;
}

/**
 * 按 P 键在玩家头顶切换测试气泡（boluo icon + x 3）。
 */
@ccclass('SpeechBubbleTestInput')
export class SpeechBubbleTestInput extends Component {
    @property({ tooltip: '测试数量' })
    testAmount = 3;

    @property({ tooltip: '相对玩家本地坐标头顶偏移' })
    localOffset = new Vec3(0, 2.1, 0);

    private _visible = false;

    onLoad() {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    private _onKeyDown(event: { keyCode: number }): void {
        if (event.keyCode !== KeyCode.KEY_P) {
            return;
        }

        const player = findNodeByName(director.getScene(), 'Protagonist');
        if (!player?.isValid) {
            console.warn('[SpeechBubbleTestInput] 未找到 Protagonist，请先进入游戏');
            return;
        }

        const bubbles = SpeechBubbleManager.ensure();
        if (this._visible) {
            bubbles.hide(TEST_BUBBLE_ID);
            this._visible = false;
            return;
        }

        bubbles.showOnTarget(
            TEST_BUBBLE_ID,
            player,
            [{ type: CurrencyType.PineappleJuice, amount: this.testAmount }],
            this.localOffset,
        );
        this._visible = true;
    }
}
