import { _decorator, Component, Enum, Node } from 'cc';
import { FruitCollectZone } from './FruitCollectZone';
import { FruitType } from './FruitType';

const { ccclass, property } = _decorator;

/**
 * 挂在 pineapple / juzi 根节点，为 boluoNode* / juziNode* 子节点自动创建采集区。
 */
@ccclass('FruitCollectFieldSetup')
export class FruitCollectFieldSetup extends Component {
    @property({ type: Enum(FruitType), tooltip: '该田地的水果类型' })
    fruitType: FruitType = FruitType.Pineapple;

    @property({ tooltip: '单个水果采集半径（XZ）' })
    collectRadius = 4;

    @property({ tooltip: '采集区整体半径（XZ），0=仅按水果距离' })
    zoneRadius = 0;

    @property({ tooltip: '打印田地初始化日志' })
    debugLog = true;

    onLoad() {
        this.apply();
    }

    public apply(): void {
        const prefix = this.fruitType === FruitType.Pineapple ? 'boluoNode' : 'juziNode';
        let zoneCount = 0;
        let sourceCount = 0;
        for (const child of this.node.children) {
            if (!child.name.startsWith(prefix)) {
                continue;
            }
            const zone = child.getComponent(FruitCollectZone) ?? child.addComponent(FruitCollectZone);
            zone.fruitType = this.fruitType;
            zone.collectRadius = this.collectRadius;
            zone.zoneRadius = this.zoneRadius;
            zone.debugLog = this.debugLog;
            zone.bindFruitSources();
            zoneCount += 1;
            sourceCount += zone.sources.length;
        }
        if (this.debugLog) {
            console.log(
                `[FruitCollectFieldSetup] field=${this.node.name} type=${FruitType[this.fruitType]} `
                + `zones=${zoneCount} sources=${sourceCount} collectR=${this.collectRadius}`,
            );
        }
    }

    /** 在 Island 的 pineapple / juzi 节点上确保采集区已配置 */
    public static ensureOnIsland(island: Node | null): void {
        if (!island) {
            console.warn('[FruitCollectFieldSetup] Island 节点未找到，无法初始化采集区');
            return;
        }
        const pineapple = island.getChildByName('pineapple');
        const juzi = island.getChildByName('juzi');
        if (!pineapple) {
            console.warn('[FruitCollectFieldSetup] 未找到 pineapple 节点');
        }
        if (!juzi) {
            console.warn('[FruitCollectFieldSetup] 未找到 juzi 节点');
        }
        FruitCollectFieldSetup._ensureOnField(pineapple, FruitType.Pineapple);
        FruitCollectFieldSetup._ensureOnField(juzi, FruitType.Orange);
        console.log(`[FruitCollectFieldSetup] 初始化完成，当前采集区数量=${FruitCollectZone.all.length}`);
    }

    private static _ensureOnField(fieldNode: Node | null, fruitType: FruitType): void {
        if (!fieldNode) {
            return;
        }
        const setup = fieldNode.getComponent(FruitCollectFieldSetup)
            ?? fieldNode.addComponent(FruitCollectFieldSetup);
        setup.fruitType = fruitType;
        if (fruitType === FruitType.Pineapple) {
            setup.collectRadius = 2;
        }
        setup.apply();
    }
}
