import {
    _decorator,
    Component,
    director,
    math,
    Node,
    Prefab,
    Quat,
    Vec3,
} from 'cc';
import { CurrencyCost } from '../currency/CurrencyType';
import { OrderManager } from '../order/OrderManager';
import { OrderRequirementItem } from '../order/OrderRequirement';
import { OrderSubject } from '../order/OrderSubject';
import { OrderSubjectType } from '../order/OrderSubjectType';
import { AppearanceController } from './AppearanceController';
import { CharacterAppearanceType } from './CharacterAppearanceType';
import { CharacterAnimState } from './CharacterAnimState';
import { CharacterAnimController } from './CharacterAnimController';

const { ccclass, property } = _decorator;

const CUSTOMER_TYPES = [
    CharacterAppearanceType.Customer0,
    CharacterAppearanceType.Customer1,
] as const;

/** 单个顾客的生成与订单配置 */
export interface CustomerSpawnConfig {
    position: Vec3;
    appearance?: CharacterAppearanceType;
    requirements: CurrencyCost[];
    subjectId?: string;
    displayName?: string;
}

/** 在圆内均匀随机一点（XZ 平面） */
function samplePointInCircle(center: Vec3, radius: number, out: Vec3): Vec3 {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    out.set(
        center.x + Math.cos(angle) * r,
        center.y,
        center.z + Math.sin(angle) * r,
    );
    return out;
}

function pickRandomCustomerAppearance(): CharacterAppearanceType {
    const index = Math.floor(Math.random() * CUSTOMER_TYPES.length);
    return CUSTOMER_TYPES[index];
}

/**
 * 在指定圆心半径内生成顾客，随机形象并播放顾客待机。
 */
@ccclass('CustomerSpawner')
export class CustomerSpawner extends Component {
    @property({ tooltip: '圆心世界坐标' })
    center = new Vec3(0, 0, 0);

    @property({ tooltip: '生成半径' })
    radius = 2;

    @property({ tooltip: '生成数量' })
    count = 3;

    @property({ type: Prefab, tooltip: '可选 NPC_RIG 预制体' })
    npcPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: '顾客父节点，不填则自动创建 Customers' })
    customerParent: Node | null = null;

    @property({ tooltip: '启动时自动生成' })
    spawnOnStart = false;

    @property({ tooltip: '生成后朝向的世界坐标点' })
    lookAtTarget = new Vec3(0, 0, 0);

    @property({ tooltip: '是否显示鸭子道具' })
    showDuck = true;

    @property({ tooltip: '鸭子款式：1=duck01，2=duck02' })
    duckVariant: 1 | 2 = 2;

    private readonly _customers: Node[] = [];
    private _spawned = false;

    start() {
        if (this.spawnOnStart) {
            this.spawnCustomers();
        }
    }

    /** 生成顾客（重复调用会先清理旧顾客） */
    public spawnCustomers(): void {
        if (this.count <= 0) {
            return;
        }
        const configs: CustomerSpawnConfig[] = [];
        for (let i = 0; i < this.count; i += 1) {
            configs.push({
                position: samplePointInCircle(this.center, this.radius, new Vec3()),
                requirements: [],
            });
        }
        this.spawnFromConfigs(configs);
    }

    /** 按固定点位生成顾客并绑定订单（显示头顶气泡） */
    public spawnFromConfigs(configs: CustomerSpawnConfig[]): void {
        this.clearCustomers();
        if (configs.length === 0) {
            return;
        }

        const parent = this._resolveParent();
        let pending = configs.length;

        for (let i = 0; i < configs.length; i += 1) {
            const config = configs[i];
            const appearance = config.appearance ?? pickRandomCustomerAppearance();
            const pos = config.position.clone();
            const index = i;

            AppearanceController.create(
                parent,
                appearance,
                (controller, characterNode) => {
                    characterNode.name = config.subjectId || `Customer_${index}`;
                    characterNode.setWorldPosition(pos);
                    this._faceTarget(characterNode, this.lookAtTarget);

                    if (this.showDuck) {
                        controller.enableDuck(this.duckVariant);
                    }

                    const anim = characterNode.getComponent(CharacterAnimController)
                        ?? characterNode.addComponent(CharacterAnimController);
                    anim.defaultState = CharacterAnimState.CustomerIdle;
                    anim.play(CharacterAnimState.CustomerIdle);

                    if (config.requirements.length > 0) {
                        this._bindOrder(characterNode, config, index);
                    }

                    this._customers.push(characterNode);
                    pending -= 1;
                    if (pending <= 0) {
                        this._spawned = true;
                    }
                },
                this.npcPrefab,
            );
        }
    }

    public clearCustomers(): void {
        for (const node of this._customers) {
            if (node.isValid) {
                node.destroy();
            }
        }
        this._customers.length = 0;
        this._spawned = false;
    }

    public get customers(): readonly Node[] {
        return this._customers;
    }

    public get hasSpawned(): boolean {
        return this._spawned;
    }

    private _bindOrder(customerNode: Node, config: CustomerSpawnConfig, index: number): void {
        const subject = customerNode.addComponent(OrderSubject);
        subject.subjectId = config.subjectId || `Customer_${index}`;
        subject.subjectType = OrderSubjectType.Customer;
        subject.displayName = config.displayName || '顾客';
        subject.registerOnLoad = false;
        subject.requirements = config.requirements.map((req) => {
            const item = new OrderRequirementItem();
            item.goodsType = req.type;
            item.amount = req.amount;
            return item;
        });
        OrderManager.ensure().registerSubject(subject);
    }

    private _resolveParent(): Node {
        if (this.customerParent?.isValid) {
            return this.customerParent;
        }

        const island = director.getScene()?.getChildByName('Island');
        if (island) {
            return island;
        }
        const start = director.getScene()?.getChildByName('start');
        if (start) {
            let group = start.getChildByName('Customers');
            if (!group) {
                group = new Node('Customers');
                start.addChild(group);
            }
            this.customerParent = group;
            return group;
        }
        throw new Error('[CustomerSpawner] 未找到 Island 或 start 节点');
    }

    /** 绕 Y 轴朝向目标点（与 PlayerMovementController 同一套朝向约定） */
    private _faceTarget(node: Node, target: Vec3): void {
        const pos = node.worldPosition;
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        if (dx * dx + dz * dz < 1e-6) {
            return;
        }
        const yaw = math.toDegree(Math.atan2(dx, dz));
        const rot = new Quat();
        Quat.fromEuler(rot, 0, yaw, 0);
        node.setWorldRotation(rot);
    }
}
