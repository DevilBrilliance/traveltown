import {
    _decorator,
    Component,
    director,
    Material,
    MeshRenderer,
    Node,
} from 'cc';
import { EasyTouchJoystick } from '../easytouch/EasyTouchJoystick';
import { PlayAreaBoundary } from './PlayAreaBoundary';
import { batchStaticMeshesUnder } from './StaticMeshBatcher';

const { ccclass, property } = _decorator;

/**
 * Playable 渲染优化：静态合批（类似 Unity Static Batching）+ GPU Instancing + 轻量裁剪。
 *
 * 栏杆等同材质重复网格会合并为 1 个 DrawCall，不再隐藏。
 */
@ccclass('PlayableDrawCallOptimizer')
export class PlayableDrawCallOptimizer extends Component {
    @property({ tooltip: '启用 Playable 优化' })
    playableMode = true;

    @property({ tooltip: '对指定分组做静态网格合批（如 zhalan 栏杆）' })
    enableStaticBatch = true;

    @property({ type: [String], tooltip: '静态合批的分组节点名（Island 下）；可采集水果不要合批' })
    staticBatchGroups: string[] = ['zhalan'];

    @property({ tooltip: '对剩余静态网格尝试 GPU Instancing（同材质实例）' })
    enableGpuInstancing = true;

    @property({ tooltip: '禁用可玩区外的 MeshRenderer（默认关，避免误裁栏杆）' })
    cullOutsidePlayArea = false;

    @property({ tooltip: '可玩区外扩/内缩' })
    playAreaPadding = 1.5;

    @property({ type: [String], tooltip: '额外隐藏的分组（一般留空）' })
    extraHideGroups: string[] = [];

    @property({ tooltip: '关闭 EasyTouch Backdrop 精灵（-1 DrawCall）' })
    disableJoystickBackdrop = true;

    @property({ tooltip: '优化完成后打印统计' })
    logStats = true;

    private readonly _instancingMaterials = new Set<Material>();
    private _batchRoot: Node | null = null;

    start() {
        if (!this.playableMode) {
            return;
        }
        this.scheduleOnce(() => this._apply(), 0.15);
    }

    private _apply(): void {
        const island = director.getScene()?.getChildByName('Island');
        if (!island) {
            console.warn('[PlayableDrawCallOptimizer] 未找到 Island');
            return;
        }

        const before = this._countEnabledMeshRenderers(island);

        PlayAreaBoundary.instance?.rebuild();
        this._hideGroups(island);
        const batchStats = this._runStaticBatch(island);
        this._cullMeshRenderers(island);
        if (this.enableGpuInstancing) {
            this._enableGpuInstancing(island);
        }
        if (this.disableJoystickBackdrop) {
            this._disableJoystickBackdrop();
        }

        const after = this._countEnabledMeshRenderers(island);
        if (this.logStats) {
            console.log(
                `[PlayableDrawCallOptimizer] 静态合批 ${batchStats.batches} 组`
                + `，合并 ${batchStats.mergedRenderers} 个 MeshRenderer`
                + `；Island 启用数 ${before} → ${after}`
                + `（UI / 主角另计）`,
            );
        }
    }

    private _runStaticBatch(island: Node): { batches: number; mergedRenderers: number } {
        if (!this.enableStaticBatch || this.staticBatchGroups.length === 0) {
            return { batches: 0, mergedRenderers: 0 };
        }

        if (!this._batchRoot?.isValid) {
            this._batchRoot = new Node('StaticBatchedMeshes');
            this._batchRoot.setParent(island);
        }

        let batches = 0;
        let mergedRenderers = 0;
        for (const name of this.staticBatchGroups) {
            const group = island.getChildByName(name);
            if (!group?.isValid) {
                continue;
            }
            const result = batchStaticMeshesUnder(group, this._batchRoot, island);
            batches += result.batches;
            mergedRenderers += result.mergedRenderers;
        }
        return { batches, mergedRenderers };
    }

    private _hideGroups(island: Node): void {
        for (const name of this.extraHideGroups) {
            const group = island.getChildByName(name);
            if (group?.isValid) {
                group.active = false;
            }
        }
    }

    private _cullMeshRenderers(_island: Node): void {
        if (!this.cullOutsidePlayArea) {
            return;
        }
    }

    private _enableGpuInstancing(island: Node): void {
        for (const renderer of island.getComponentsInChildren(MeshRenderer)) {
            if (!renderer.enabled) {
                continue;
            }
            const material = renderer.sharedMaterial;
            if (!material || this._instancingMaterials.has(material)) {
                continue;
            }
            try {
                material.recompileShaders({ USE_INSTANCING: true });
                this._instancingMaterials.add(material);
            } catch {
                // 不支持 instancing 的材质忽略
            }
        }
    }

    private _disableJoystickBackdrop(): void {
        const scene = director.getScene();
        const joystick = scene?.getComponentInChildren(EasyTouchJoystick);
        if (joystick) {
            joystick.setOpaqueBackdropEnabled(false);
            return;
        }
        const easyTouch = scene?.getChildByName('mainCanvas')?.getChildByName('EasyTouch');
        const backdrop = easyTouch?.getChildByName('JoystickRoot')?.getChildByName('Backdrop')
            ?? easyTouch?.getChildByName('Backdrop');
        if (backdrop) {
            backdrop.active = false;
        }
    }

    private _countEnabledMeshRenderers(root: Node): number {
        let count = 0;
        for (const renderer of root.getComponentsInChildren(MeshRenderer)) {
            if (renderer.enabled && renderer.node.activeInHierarchy) {
                count += 1;
            }
        }
        return count;
    }
}
