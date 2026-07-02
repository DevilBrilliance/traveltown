import {
    _decorator,
    Component,
    instantiate,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import { CurrencyCost } from '../../currency/CurrencyType';
import { BUBBLE_ICON_PATHS } from './BubbleIconPaths';
import { SpeechBubbleItemView } from './SpeechBubbleItemView';

const { ccclass, property } = _decorator;

/**
 * 订单气泡预制体根组件。在编辑器中调整 Bg / ItemTemplate / Label 样式即可。
 */
@ccclass('SpeechBubbleView')
export class SpeechBubbleView extends Component {
    @property({ type: Node, tooltip: '物品容器，不填则查找 Content' })
    content: Node | null = null;

    @property({ type: Node, tooltip: '物品行模板（会被克隆），不填则查找 ItemTemplate' })
    itemTemplate: Node | null = null;

    @property({ tooltip: '物品横向间距' })
    itemGap = 8;

    @property({ tooltip: '背景相对内容的内边距 X' })
    paddingX = 24;

    @property({ tooltip: '背景相对内容的内边距 Y' })
    paddingY = 16;

    @property({ tooltip: 'icon 行高参考（用于背景高度，0=读模板高度）' })
    rowHeight = 0;

    onLoad() {
        this.bindNodes();
    }

    public bindNodes(): void {
        if (!this.content) {
            this.content = this.node.getChildByName('Content');
        }
        if (!this.itemTemplate) {
            this.itemTemplate = this.content?.getChildByName('ItemTemplate')
                ?? this.node.getChildByName('ItemTemplate')
                ?? null;
        }
        if (this.itemTemplate && !this.itemTemplate.getComponent(SpeechBubbleItemView)) {
            this.itemTemplate.addComponent(SpeechBubbleItemView).bindNodes();
        }
    }

    public applyItems(
        items: CurrencyCost[],
        getFrame: (path: string) => SpriteFrame | null,
    ): void {
        this.bindNodes();
        if (!this.content || !this.itemTemplate) {
            return;
        }

        for (const child of [...this.content.children]) {
            if (child !== this.itemTemplate) {
                child.destroy();
            }
        }

        const templateView = this.itemTemplate.getComponent(SpeechBubbleItemView)
            ?? this.itemTemplate.addComponent(SpeechBubbleItemView);
        templateView.bindNodes();
        this.itemTemplate.active = false;

        const rows: Node[] = [];
        let totalW = 0;
        const iconSize = this.itemTemplate.getComponent(UITransform)?.height ?? 52;

        for (const item of items) {
            const row = instantiate(this.itemTemplate);
            row.name = `Item_${item.type}`;
            row.active = true;
            row.parent = this.content;

            const rowView = row.getComponent(SpeechBubbleItemView)
                ?? row.addComponent(SpeechBubbleItemView);
            rowView.bindNodes();
            const iconPath = BUBBLE_ICON_PATHS[item.type];
            rowView.apply(item, iconPath ? getFrame(iconPath) : null);

            rows.push(row);
            totalW += rowView.getRowWidth(iconSize);
        }
        totalW += this.itemGap * Math.max(0, rows.length - 1);

        let cursorX = -totalW * 0.5;
        for (const row of rows) {
            const rowUi = row.getComponent(UITransform)!;
            row.setPosition(cursorX + rowUi.width * 0.5, 0, 0);
            cursorX += rowUi.width + this.itemGap;
        }

        const rowH = this.rowHeight > 0 ? this.rowHeight : iconSize;
        const bgW = totalW + this.paddingX * 2;
        const bgH = rowH + this.paddingY * 2;
        const bg = this.node.getChildByName('Bg');
        bg?.getComponent(UITransform)?.setContentSize(bgW, bgH);
        this.node.getComponent(UITransform)?.setContentSize(bgW, bgH);
    }

    public applyBackground(frame: SpriteFrame | null): void {
        if (!frame) {
            return;
        }
        const bg = this.node.getChildByName('Bg');
        const sprite = bg?.getComponent(Sprite);
        if (sprite) {
            sprite.spriteFrame = frame;
        }
    }
}
