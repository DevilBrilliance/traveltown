import { _decorator, Component, Enum, instantiate, MeshRenderer, Node } from 'cc';
import { findCharacterBone } from '../character/CharacterSocketHelper';
import { FruitCollectZone } from './FruitCollectZone';
import { FruitType } from './FruitType';

const { ccclass, property } = _decorator;

/**
 * 场景中的单个水果实例（如 Pineapple_0、ChengZi）。
 * 由 FruitCollectZone 在运行时绑定。
 */
@ccclass('FruitSource')
export class FruitSource extends Component {
    @property({ type: Enum(FruitType), tooltip: '水果类型，通常由采集区自动写入' })
    fruitType: FruitType = FruitType.Pineapple;

    zone: FruitCollectZone | null = null;

    private _collected = false;
    private _renderers: MeshRenderer[] = [];

    public get isAvailable(): boolean {
        return !this._collected && this.node.activeInHierarchy;
    }

    onLoad() {
        this._cacheRenderers();
    }

    /** 被玩家采集后隐藏场景中的水果 */
    public markCollected(): void {
        if (this._collected) {
            return;
        }
        this._collected = true;
        this._cacheRenderers();
        for (const renderer of this._renderers) {
            renderer.enabled = false;
        }
        this.node.active = false;
    }

    /** 重置为可再次采集（调试或重生用） */
    public resetCollected(): void {
        this._collected = false;
        this.node.active = true;
        this._cacheRenderers();
        for (const renderer of this._renderers) {
            renderer.enabled = true;
        }
    }

    /** 克隆背上展示用的水果节点（仅 Boluo 网格，不含植株） */
    public createCarryVisualNode(): Node {
        const boluo = findCharacterBone(this.node, 'Boluo');
        const visual = boluo ? instantiate(boluo) : instantiate(this.node);
        visual.active = true;
        visual.setPosition(0, 0, 0);
        visual.setRotationFromEuler(0, 0, 0);
        for (const renderer of visual.getComponentsInChildren(MeshRenderer)) {
            renderer.enabled = true;
        }
        if (!boluo) {
            for (const child of visual.children) {
                const lower = child.name.toLowerCase();
                if (lower.includes('gan') || lower.includes('tudi')) {
                    child.active = false;
                }
            }
        }
        return visual;
    }

    /** @deprecated 使用 createCarryVisualNode */
    public createCarryVisualRoot(): Node {
        return this.node;
    }

    private _cacheRenderers(): void {
        if (this._renderers.length === 0) {
            this._renderers = this.node.getComponentsInChildren(MeshRenderer);
        }
    }
}
