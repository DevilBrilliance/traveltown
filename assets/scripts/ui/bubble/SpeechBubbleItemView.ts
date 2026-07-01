import {
    _decorator,
    Component,
    Label,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import { CurrencyCost } from '../../currency/CurrencyType';

const { ccclass, property } = _decorator;

/**
 * 气泡内单行：icon + 数量。挂在 ItemTemplate 节点上，可在预制体里调样式。
 */
@ccclass('SpeechBubbleItemView')
export class SpeechBubbleItemView extends Component {
    @property({ type: Sprite, tooltip: '商品 icon' })
    icon: Sprite | null = null;

    @property({ type: Label, tooltip: '数量文字（如 x 3）' })
    countLabel: Label | null = null;

    onLoad() {
        this.bindNodes();
    }

    public bindNodes(): void {
        if (!this.icon) {
            this.icon = this.node.getChildByName('Icon')?.getComponent(Sprite) ?? null;
        }
        if (!this.countLabel) {
            this.countLabel = this.node.getChildByName('Count')?.getComponent(Label) ?? null;
        }
    }

    public apply(item: CurrencyCost, frame: SpriteFrame | null): void {
        if (frame && this.icon) {
            this.icon.spriteFrame = frame;
        }
        if (this.countLabel) {
            this.countLabel.string = `x ${item.amount}`;
        }
    }

    public getRowWidth(iconSize: number): number {
        const labelW = this.countLabel?.node.getComponent(UITransform)?.width ?? 48;
        return iconSize + 4 + labelW;
    }
}
