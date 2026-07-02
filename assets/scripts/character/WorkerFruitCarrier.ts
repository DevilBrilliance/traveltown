import {
    _decorator,
    Component,
    MeshRenderer,
    Node,
    Vec3,
} from 'cc';
import { AudioController } from '../audio/AudioController';
import { AppearanceController } from '../character/AppearanceController';
import { CharacterAnimController } from '../character/CharacterAnimController';
import { CharacterAnimState } from '../character/CharacterAnimState';
import { FruitSource } from '../fruit/FruitSource';
import { FruitType } from '../fruit/FruitType';

const { ccclass, property } = _decorator;

/**
 * 工人背篓：收割菠萝（镰刀动画同主角，不播砍菠萝音效，采集播菠萝收集音）。
 */
@ccclass('WorkerFruitCarrier')
export class WorkerFruitCarrier extends Component {
    @property({ tooltip: '背上最多菠萝数' })
    maxCarryCount = 10;

    @property({ tooltip: '菠萝收割检测半径（XZ）' })
    pineappleCollectRadius = 2;

    @property({ tooltip: '收割间隔（秒）' })
    collectInterval = 0.35;

    @property({ tooltip: '后背挂点（玩家本地坐标）' })
    carryBackOffset = new Vec3(0, 1.05, 0.82);

    @property({ tooltip: '挂点本地欧拉角' })
    carryBackEuler = new Vec3(0, 0, 0);

    @property({ tooltip: '多层水果堆叠偏移' })
    stackLocalOffset = new Vec3(0, 0.5, 0);

    @property({ tooltip: '背上水果缩放' })
    carryVisualScale = 1;

    @property({ tooltip: '水果朝向' })
    fruitLocalEuler = new Vec3(-90, 0, 0);

    @property({ tooltip: '水果中心微调' })
    fruitPivotOffset = new Vec3(0, 0, 0);

    private _stackRoot: Node | null = null;
    private _stackSlots: Node[] = [];
    private _carriedTypes: FruitType[] = [];
    private _collectCooldown = 0;
    private _isHarvesting = false;
    private _targetSource: FruitSource | null = null;

    private readonly _worldPos = new Vec3();
    private readonly _fruitPos = new Vec3();
    private readonly _tmpCenter = new Vec3();

    public get carriedCount(): number {
        return this._carriedTypes.length;
    }

    public get isFull(): boolean {
        return this.carriedCount >= this.maxCarryCount;
    }

    public get isHarvesting(): boolean {
        return this._isHarvesting;
    }

    public get isOnCollectCooldown(): boolean {
        return this._collectCooldown > 0;
    }

    public get pineappleCount(): number {
        let count = 0;
        for (const type of this._carriedTypes) {
            if (type === FruitType.Pineapple) {
                count += 1;
            }
        }
        return count;
    }

    public get targetSource(): FruitSource | null {
        return this._targetSource;
    }

    public removeOnePineapple(): boolean {
        for (let i = this._carriedTypes.length - 1; i >= 0; i -= 1) {
            if (this._carriedTypes[i] !== FruitType.Pineapple) {
                continue;
            }
            this._carriedTypes.splice(i, 1);
            this._stackSlots[i]?.destroy();
            this._stackSlots.splice(i, 1);
            this._reindexStackPositions();
            return true;
        }
        return false;
    }

    public setHarvestTarget(source: FruitSource | null): void {
        this._targetSource = source;
    }

    public isInHarvestRange(source: FruitSource | null = this._targetSource): boolean {
        if (!source?.isAvailable) {
            return false;
        }
        this.node.getWorldPosition(this._worldPos);
        source.getCollectWorldPosition(this._fruitPos);
        const dx = this._worldPos.x - this._fruitPos.x;
        const dz = this._worldPos.z - this._fruitPos.z;
        const radiusSq = this.pineappleCollectRadius * this.pineappleCollectRadius;
        return dx * dx + dz * dz <= radiusSq;
    }

    public tryStartHarvest(source: FruitSource | null = this._targetSource): boolean {
        if (!source?.isAvailable || this._isHarvesting || this.isFull || this._collectCooldown > 0) {
            return false;
        }
        if (!this.isInHarvestRange(source)) {
            return false;
        }
        this._startHarvest(source);
        return true;
    }

    public getLocomotionAnimState(moving: boolean): CharacterAnimState | null {
        if (this._isHarvesting) {
            return CharacterAnimState.Harvest;
        }
        // 背上菠萝仍用普通跑步/待机，端盘动作仅留给服务员端果汁
        return moving ? CharacterAnimState.PlayerRun : CharacterAnimState.PlayerIdle;
    }

    onDestroy() {
        this._targetSource = null;
        this._isHarvesting = false;
        this.node?.getComponent(AppearanceController)?.disableSickle();
    }

    update(dt: number) {
        this._updateCarryMount();
        if (this._collectCooldown > 0) {
            this._collectCooldown -= dt;
        }
    }

    private _startHarvest(source: FruitSource): void {
        this._isHarvesting = true;
        this._targetSource = source;
        this.node.getComponent(AppearanceController)?.enableSickle();
        AudioController.instance?.stopLoop();
        this.node.emit('fruit-harvest-started');

        const anim = this.node.getComponent(CharacterAnimController);
        if (!anim) {
            this._finishHarvest(source);
            return;
        }
        anim.playOnce(CharacterAnimState.Harvest, () => {
            this._finishHarvest(source);
        });
    }

    private _finishHarvest(source: FruitSource): void {
        this._isHarvesting = false;
        if (!this.node?.isValid) {
            return;
        }
        this.node.getComponent(AppearanceController)?.disableSickle();

        if (source?.isAvailable && this.isInHarvestRange(source) && !this.isFull) {
            this._collect(source);
        }

        this.node.emit('fruit-collect-anim-finished');
    }

    private _collect(source: FruitSource): void {
        this._ensureCarryRoot();
        if (!this._stackRoot?.isValid) {
            return;
        }
        this._spawnBackVisual(source);
        source.markCollected();
        this._carriedTypes.push(FruitType.Pineapple);
        this._collectCooldown = this.collectInterval;
    }

    private _ensureCarryRoot(): void {
        if (this._stackRoot?.isValid) {
            return;
        }
        let root = this.node.getChildByName('FruitCarryRoot');
        if (!root) {
            root = new Node('FruitCarryRoot');
            root.setParent(this.node, false);
        }
        this._stackRoot = root;
    }

    private _updateCarryMount(): void {
        this._ensureCarryRoot();
        const stackRoot = this._stackRoot;
        if (!stackRoot?.isValid) {
            return;
        }
        stackRoot.setPosition(this.carryBackOffset);
        stackRoot.setRotationFromEuler(this.carryBackEuler);
    }

    private _reindexStackPositions(): void {
        for (let i = 0; i < this._stackSlots.length; i += 1) {
            const slot = this._stackSlots[i];
            if (!slot?.isValid) {
                continue;
            }
            slot.setPosition(
                this.stackLocalOffset.x * i,
                this.stackLocalOffset.y * i,
                this.stackLocalOffset.z * i,
            );
        }
    }

    private _spawnBackVisual(source: FruitSource): void {
        const stackRoot = this._stackRoot!;
        const index = this._stackSlots.length;
        const slot = new Node(`StackSlot_${index}`);
        slot.setParent(stackRoot, false);
        slot.setPosition(
            this.stackLocalOffset.x * index,
            this.stackLocalOffset.y * index,
            this.stackLocalOffset.z * index,
        );

        const boluo = source.createCarryVisualNode();
        boluo.name = 'BoluoCarry';
        this._computeMeshCenter(boluo, this._tmpCenter);

        const pivot = new Node('FruitPivot');
        pivot.setParent(slot, false);
        pivot.setPosition(
            this.fruitPivotOffset.x - this._tmpCenter.x,
            this.fruitPivotOffset.y - this._tmpCenter.y,
            this.fruitPivotOffset.z - this._tmpCenter.z,
        );

        const rot = new Node('FruitRot');
        rot.setParent(pivot, false);
        rot.setRotationFromEuler(this.fruitLocalEuler);

        boluo.setParent(rot, false);
        boluo.setPosition(0, 0, 0);
        boluo.setRotationFromEuler(0, 0, 0);
        boluo.setScale(this.carryVisualScale, this.carryVisualScale, this.carryVisualScale);
        this._stackSlots.push(slot);
    }

    private _computeMeshCenter(root: Node, out: Vec3): void {
        out.set(0, 0, 0);
        const renderer = root.getComponent(MeshRenderer)
            ?? root.getComponentInChildren(MeshRenderer);
        const struct = renderer?.mesh?.struct;
        if (!struct?.minPosition || !struct?.maxPosition) {
            return;
        }
        const { minPosition, maxPosition } = struct;
        out.set(
            (minPosition.x + maxPosition.x) * 0.5,
            (minPosition.y + maxPosition.y) * 0.5,
            (minPosition.z + maxPosition.z) * 0.5,
        );
    }
}
