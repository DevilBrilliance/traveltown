import {

    _decorator,

    Component,

    MeshRenderer,

    Node,

    Vec3,

} from 'cc';

import { AudioController } from '../audio/AudioController';

import { SoundEffect } from '../audio/SoundEffect';

import { AppearanceController } from '../character/AppearanceController';

import { CharacterAnimController } from '../character/CharacterAnimController';

import { CharacterAnimState } from '../character/CharacterAnimState';

import { FruitCollectZone } from './FruitCollectZone';

import { FruitSource } from './FruitSource';

import { FruitType } from './FruitType';



const { ccclass, property } = _decorator;



/**

 * 玩家背篓：tick 检测采集区，挂点跟随玩家本地坐标（后背偏移）。

 */

@ccclass('PlayerFruitCarrier')

export class PlayerFruitCarrier extends Component {

    @property({ tooltip: '背上最多同时携带的水果数量' })

    maxCarryCount = 10;



    @property({ tooltip: '采集检测半径（XZ）' })

    collectRadius = 4;



    @property({ tooltip: '两次采集间隔（秒）' })

    collectInterval = 0.35;



    @property({ type: Node, tooltip: '后背堆叠根节点，不填则自动创建 FruitCarryRoot' })

    carryAnchor: Node | null = null;



    @property({ tooltip: '后背挂点（玩家本地坐标，Y 高度，-Z 为背后）' })

    carryBackOffset = new Vec3(0, 1.05, 0.82);



    @property({ tooltip: '挂点本地欧拉角' })

    carryBackEuler = new Vec3(0, 0, 0);



    @property({ tooltip: '多层水果堆叠偏移' })

    stackLocalOffset = new Vec3(0, 0.5, 0);



    @property({ tooltip: '背上水果缩放' })

    carryVisualScale = 1;



    @property({ tooltip: '水果朝向（只绕中心旋转，不会改挂点位置）' })

    fruitLocalEuler = new Vec3(-90, 0, 0);



    @property({ tooltip: '水果中心微调' })
    fruitPivotOffset = new Vec3(0, 0, 0);

    @property({ tooltip: '面前方向点积阈值（越大越严格，只采正前方）' })
    frontCollectDot = 0.35;

    private readonly _tmpCenter = new Vec3();



    private _stackRoot: Node | null = null;

    private _stackSlots: Node[] = [];

    private _carriedTypes: FruitType[] = [];

    private _collectCooldown = 0;
    private _isHarvesting = false;
    private _pendingHarvestSource: FruitSource | null = null;

    private readonly _worldPos = new Vec3();
    private readonly _fruitPos = new Vec3();
    private readonly _forward = new Vec3();



    public get carriedCount(): number {

        return this._carriedTypes.length;

    }



    public get isFull(): boolean {

        return this.carriedCount >= this.maxCarryCount;

    }



    public get carriedTypes(): readonly FruitType[] {

        return this._carriedTypes;

    }



    onDestroy() {

        this._pendingHarvestSource = null;

        this._isHarvesting = false;

        if (this.node?.isValid) {

            this.node.getComponent(AppearanceController)?.disableSickle();

        }

    }



    update(dt: number) {

        this._updateCarryMount();



        if (this._collectCooldown > 0) {

            this._collectCooldown -= dt;

        }

        if (this._isHarvesting || this.isFull || this._collectCooldown > 0) {

            return;

        }



        this.node.getWorldPosition(this._worldPos);

        const source = this._findNearestCollectible(this._worldPos);

        if (!source) {

            return;

        }

        if (source.fruitType === FruitType.Orange) {
            this._collect(source);
            return;
        }

        this._startPineappleHarvest(source);

    }



    public getLocomotionAnimState(moving: boolean): CharacterAnimState | null {

        if (this._isHarvesting) {

            return CharacterAnimState.Harvest;

        }

        if (this.carriedCount > 0) {

            return moving ? CharacterAnimState.PlateRun : CharacterAnimState.PlateIdle;

        }

        return null;

    }



    public clearCarried(restoreSceneFruits = false): void {

        for (const slot of this._stackSlots) {

            if (slot.isValid) {

                slot.destroy();

            }

        }

        this._stackSlots.length = 0;

        if (restoreSceneFruits) {

            for (const zone of FruitCollectZone.all) {

                for (const source of zone.sources) {

                    source.resetCollected();

                }

            }

        }

        this._carriedTypes.length = 0;

        this.node.emit('fruit-carry-changed', this.carriedCount);

    }



    private _ensureCarryRoot(): void {

        if (this._stackRoot?.isValid) {

            return;

        }



        if (this.carryAnchor?.isValid) {

            this._stackRoot = this.carryAnchor;

            return;

        }



        let root = this.node.getChildByName('FruitCarryRoot');

        if (!root) {

            root = new Node('FruitCarryRoot');

            root.setParent(this.node, false);

        }

        this._stackRoot = root;

        this.carryAnchor = root;

    }



    /** 每帧同步后背挂点（玩家本地偏移，随转身自动转到背后） */

    private _updateCarryMount(): void {

        this._ensureCarryRoot();

        const stackRoot = this._stackRoot;

        if (!stackRoot?.isValid) {

            return;

        }



        stackRoot.setPosition(this.carryBackOffset);

        stackRoot.setRotationFromEuler(this.carryBackEuler);

    }



    private _findNearestCollectible(
        playerWorldPos: Vec3,
        filterType?: FruitType,
        preferFront = true,
    ): FruitSource | null {
        const radiusSq = this.collectRadius * this.collectRadius;
        let bestFront: FruitSource | null = null;
        let bestFrontDistSq = radiusSq + 1;
        let bestAny: FruitSource | null = null;
        let bestAnyDistSq = radiusSq + 1;

        if (preferFront) {
            this._getPlayerForwardXZ(this._forward);
        }

        for (const zone of FruitCollectZone.all) {
            if (filterType !== undefined && zone.fruitType !== filterType) {
                continue;
            }
            for (const source of zone.sources) {
                if (!source.isAvailable) {
                    continue;
                }
                source.getCollectWorldPosition(this._fruitPos);
                const dx = playerWorldPos.x - this._fruitPos.x;
                const dz = playerWorldPos.z - this._fruitPos.z;
                const distSq = dx * dx + dz * dz;
                if (distSq > radiusSq) {
                    continue;
                }

                if (distSq < bestAnyDistSq) {
                    bestAnyDistSq = distSq;
                    bestAny = source;
                }

                if (!preferFront) {
                    continue;
                }

                const toX = this._fruitPos.x - playerWorldPos.x;
                const toZ = this._fruitPos.z - playerWorldPos.z;
                const toLen = Math.hypot(toX, toZ);
                const dot = toLen > 1e-4
                    ? (this._forward.x * toX + this._forward.z * toZ) / toLen
                    : 1;
                if (dot >= this.frontCollectDot && distSq < bestFrontDistSq) {
                    bestFrontDistSq = distSq;
                    bestFront = source;
                }
            }
        }

        return bestFront ?? bestAny;
    }

    private _getPlayerForwardXZ(out: Vec3): void {
        Vec3.copy(out, this.node.forward);
        out.y = 0;
        if (out.lengthSqr() < 1e-6) {
            out.set(0, 0, 1);
        } else {
            out.normalize();
        }
    }



    private _startPineappleHarvest(source: FruitSource): void {

        if (this._isHarvesting || !source.isAvailable) {

            return;

        }

        this._isHarvesting = true;

        this._pendingHarvestSource = source;

        this.node.getComponent(AppearanceController)?.enableSickle();

        this.node.emit('fruit-harvest-started');

        const anim = this.node.getComponent(CharacterAnimController);

        if (!anim) {

            this._finishPineappleHarvest();

            return;

        }

        anim.playOnce(CharacterAnimState.Harvest, () => {

            this._finishPineappleHarvest();

        });

    }



    private _finishPineappleHarvest(): void {
        this._isHarvesting = false;

        if (!this.node?.isValid) {
            this._pendingHarvestSource = null;
            return;
        }

        this.node.getComponent(AppearanceController)?.disableSickle();

        this.node.getWorldPosition(this._worldPos);
        const source = this._findNearestCollectible(this._worldPos, FruitType.Pineapple, true)
            ?? this._pendingHarvestSource;
        this._pendingHarvestSource = null;

        if (source?.isAvailable) {
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

        this._carriedTypes.push(source.fruitType);

        this._playCollectFeedback(source.fruitType);

        this._collectCooldown = this.collectInterval;

        this.node.emit('fruit-collected', source.fruitType, this.carriedCount);

        this.node.emit('fruit-carry-changed', this.carriedCount);

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



        // instantiate 会保留场景里的世界坐标，必须挂到背上后归零本地变换

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

        const mesh = renderer?.mesh;

        const struct = mesh?.struct;

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



    private _playCollectFeedback(fruitType: FruitType): void {

        const audio = AudioController.ensure();

        if (fruitType === FruitType.Pineapple) {

            audio.play(SoundEffect.CollectPineapple);

        } else {

            audio.play(SoundEffect.CollectJuice);

        }

    }

}


