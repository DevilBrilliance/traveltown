import {
    _decorator,
    BlockInputEvents,
    Component,
    EventTouch,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec2,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

const BG_SPRITE_PATH = 'textures/atlas/操纵/操纵_00002';
const STICK_SPRITE_PATHS = [
    'textures/atlas/操纵/操纵_00000',
];

/**
 * 虚拟摇杆（EasyTouch 风格）
 * 根节点 UITransform 尺寸即为触摸触发区域，区域内任意位置按下均可操作摇杆。
 */
@ccclass('EasyTouchJoystick')
export class EasyTouchJoystick extends Component {
    @property({ type: Node, tooltip: '背景节点（操纵_00002）' })
    background: Node | null = null;

    @property({ type: Node, tooltip: '摇杆节点（操纵_00000）' })
    stick: Node | null = null;

    @property({ tooltip: '摇杆最大偏移半径，0 表示自动取背景宽度的一半' })
    maxRadius = 0;

    @property({ tooltip: '死区比例 0~1，低于该值视为无输入' })
    deadZone = 0.1;

    /** 归一化方向向量 */
    public readonly direction = new Vec2();

    /** 摇杆偏移强度 0~1 */
    public magnitude = 0;

    /** 是否正在触摸 */
    public isTouching = false;

    private _uiTransform: UITransform | null = null;
    private _touchId = -1;
    private _radius = 120;
    private readonly _tmpVec3 = new Vec3();
    private readonly _tmpVec2 = new Vec2();

    onLoad() {
        this._uiTransform = this.node.getComponent(UITransform);
        if (!this._uiTransform) {
            this._uiTransform = this.node.addComponent(UITransform);
        }

        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }

        this._resolveNodes();
        this._loadSprites();
        this._updateRadius();

        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    /** 水平输入 -1 ~ 1 */
    public get horizontal(): number {
        return this.direction.x;
    }

    /** 垂直输入 -1 ~ 1 */
    public get vertical(): number {
        return this.direction.y;
    }

    private _resolveNodes(): void {
        if (!this.background) {
            this.background = this.node.getChildByName('Background');
        }
        if (!this.stick) {
            this.stick = this.node.getChildByName('Stick');
        }
    }

    private _updateRadius(): void {
        if (this.maxRadius > 0) {
            this._radius = this.maxRadius;
            return;
        }

        const bgTransform = this.background?.getComponent(UITransform);
        if (bgTransform) {
            this._radius = Math.min(bgTransform.width, bgTransform.height) * 0.35;
            return;
        }

        if (this._uiTransform) {
            this._radius = Math.min(this._uiTransform.width, this._uiTransform.height) * 0.35;
        }
    }

    private _loadSprites(): void {
        // 预制体已绑定 SpriteFrame，仅在缺失时再动态加载
        if (!this.background?.getComponent(Sprite)?.spriteFrame) {
            this._loadSpriteToNode(this.background, BG_SPRITE_PATH);
        }
        if (!this.stick?.getComponent(Sprite)?.spriteFrame) {
            this._loadSpriteWithFallback(this.stick, STICK_SPRITE_PATHS, 0);
        }
    }

    private _loadSpriteWithFallback(node: Node | null, paths: string[], index: number): void {
        if (!node || index >= paths.length) {
            return;
        }

        resources.load(`${paths[index]}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (err || !frame) {
                this._loadSpriteWithFallback(node, paths, index + 1);
                return;
            }
            this._applySpriteFrame(node, frame);
        });
    }

    private _loadSpriteToNode(node: Node | null, path: string): void {
        if (!node) {
            return;
        }

        resources.load(`${path}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (err || !frame) {
                console.warn(`[EasyTouchJoystick] 贴图加载失败: ${path}`, err);
                return;
            }
            this._applySpriteFrame(node, frame);
        });
    }

    private _applySpriteFrame(node: Node, frame: SpriteFrame): void {
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sprite.spriteFrame = frame;
    }

    private _onTouchStart(event: EventTouch): void {
        if (this._touchId !== -1) {
            return;
        }

        this._touchId = event.getID();
        this.isTouching = true;
        this._applyTouch(event);
        this.node.emit('joystick-start', this.direction.clone(), this.magnitude);
    }

    private _onTouchMove(event: EventTouch): void {
        if (event.getID() !== this._touchId) {
            return;
        }
        this._applyTouch(event);
        this.node.emit('joystick-move', this.direction.clone(), this.magnitude);
    }

    private _onTouchEnd(event: EventTouch): void {
        if (event.getID() !== this._touchId) {
            return;
        }

        this._touchId = -1;
        this.isTouching = false;
        this.direction.set(0, 0);
        this.magnitude = 0;
        this.stick?.setPosition(0, 0, 0);
        this.node.emit('joystick-end');
    }

    private _applyTouch(event: EventTouch): void {
        if (!this._uiTransform) {
            return;
        }

        const uiPos = event.getUILocation(this._tmpVec2);
        this._uiTransform.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0), this._tmpVec3);

        const offsetX = this._tmpVec3.x;
        const offsetY = this._tmpVec3.y;
        const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        const clampedDistance = Math.min(distance, this._radius);

        let normX = 0;
        let normY = 0;
        if (distance > 0.001) {
            normX = offsetX / distance;
            normY = offsetY / distance;
        }

        this.stick?.setPosition(normX * clampedDistance, normY * clampedDistance, 0);

        const rawMagnitude = clampedDistance / this._radius;
        if (rawMagnitude < this.deadZone) {
            this.direction.set(0, 0);
            this.magnitude = 0;
            return;
        }

        this.direction.set(normX, normY);
        this.magnitude = rawMagnitude;
    }
}
