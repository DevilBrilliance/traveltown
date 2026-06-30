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
const STICK_SPRITE_PATHS = ['textures/atlas/操纵/操纵_00000'];

/**
 * 虚拟摇杆（市面常见：默认固定位置显示，触摸区域内按下时整体跟到点击处再拖拽）
 *
 * 节点结构（脚本 onLoad 会自动整理）：
 * EasyTouch（触摸区域 TouchArea）
 * └── JoystickRoot（摇杆视觉，默认位置由编辑器摆放）
 *     ├── Background
 *     └── Stick
 */
@ccclass('EasyTouchJoystick')
export class EasyTouchJoystick extends Component {
    @property({ type: Node, tooltip: '背景节点（操纵_00002）' })
    background: Node | null = null;

    @property({ type: Node, tooltip: '摇杆头节点（操纵_00000）' })
    stick: Node | null = null;

    @property({ tooltip: '摇杆头最大偏移半径，0 表示按背景尺寸自动计算' })
    maxRadius = 0;

    @property({ tooltip: '死区比例 0~1' })
    deadZone = 0.1;

    @property({ tooltip: '在触摸区域内按下时，整个摇杆跟到手指位置' })
    floatingInTouchArea = true;

    @property({ tooltip: '松手后摇杆视觉回到默认位置' })
    resetOnRelease = true;

    /** 归一化方向 */
    public readonly direction = new Vec2();

    /** 偏移强度 0~1 */
    public magnitude = 0;

    public isTouching = false;

    private _touchArea: UITransform | null = null;
    private _joystickRoot: Node | null = null;
    private _defaultRootPos = new Vec3();
    private _radius = 60;
    private _touchId = -1;
    private readonly _tmpVec2 = new Vec2();
    private readonly _tmpVec3 = new Vec3();

    onLoad() {
        this._touchArea = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }

        this._resolveNodes();
        this._setupHierarchy();
        this._loadSprites();
        this._updateRadius();
        this._resetVisual(false);

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

    public get horizontal(): number {
        return this.direction.x;
    }

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

    /** 整理层级：Background/Stick 归到 JoystickRoot 下，便于整体移动 */
    private _setupHierarchy(): void {
        let root = this.node.getChildByName('JoystickRoot');
        if (!root) {
            root = new Node('JoystickRoot');
            root.layer = this.node.layer;
            root.parent = this.node;
            root.addComponent(UITransform).setAnchorPoint(0.5, 0.5);

            const anchor = this.background ?? this.stick;
            if (anchor) {
                root.setPosition(anchor.position);
            }

            if (this.background) {
                this.background.setPosition(0, 0, 0);
                this.background.parent = root;
            }
            if (this.stick) {
                this.stick.setPosition(0, 0, 0);
                this.stick.parent = root;
            }
        } else {
            if (!this.background) {
                this.background = root.getChildByName('Background');
            }
            if (!this.stick) {
                this.stick = root.getChildByName('Stick');
            }
        }

        this._joystickRoot = root;
        this._defaultRootPos.set(root.position);

        const centerAnchor = new Vec2(0.5, 0.5);
        this.background?.getComponent(UITransform)?.setAnchorPoint(centerAnchor);
        this.stick?.getComponent(UITransform)?.setAnchorPoint(centerAnchor);
    }

    private _updateRadius(): void {
        if (this.maxRadius > 0) {
            this._radius = this.maxRadius;
            return;
        }

        const bg = this.background?.getComponent(UITransform);
        if (bg) {
            this._radius = Math.min(bg.width, bg.height) * 0.35;
            return;
        }

        if (this._touchArea) {
            this._radius = Math.min(this._touchArea.width, this._touchArea.height) * 0.2;
        }
    }

    private _loadSprites(): void {
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

    private _touchToLocal(event: EventTouch, out: Vec3): Vec3 {
        const uiPos = event.getUILocation(this._tmpVec2);
        this._touchArea!.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0), out);
        return out;
    }

    /** 触摸点是否在 TouchArea 内（支持任意锚点） */
    private _isInTouchArea(local: Vec3): boolean {
        if (!this._touchArea) {
            return false;
        }
        const { width, height } = this._touchArea.contentSize;
        const ax = this._touchArea.anchorPoint.x;
        const ay = this._touchArea.anchorPoint.y;
        const minX = -width * ax;
        const maxX = width * (1 - ax);
        const minY = -height * ay;
        const maxY = height * (1 - ay);
        return local.x >= minX && local.x <= maxX && local.y >= minY && local.y <= maxY;
    }

    /** 浮动摇杆时，限制 JoystickRoot 中心仍在触摸区域内 */
    private _clampRootPosition(local: Vec3, out: Vec3): Vec3 {
        if (!this._touchArea) {
            out.set(local);
            return out;
        }
        const { width, height } = this._touchArea.contentSize;
        const ax = this._touchArea.anchorPoint.x;
        const ay = this._touchArea.anchorPoint.y;
        const pad = this._radius;
        const minX = -width * ax + pad;
        const maxX = width * (1 - ax) - pad;
        const minY = -height * ay + pad;
        const maxY = height * (1 - ay) - pad;
        out.set(
            Math.max(minX, Math.min(maxX, local.x)),
            Math.max(minY, Math.min(maxY, local.y)),
            0,
        );
        return out;
    }

    private _onTouchStart(event: EventTouch): void {
        if (this._touchId !== -1) {
            return;
        }

        const local = this._touchToLocal(event, this._tmpVec3);
        if (!this._isInTouchArea(local)) {
            return;
        }

        this._touchId = event.getID();
        this.isTouching = true;

        if (this.floatingInTouchArea && this._joystickRoot) {
            this._clampRootPosition(local, this._tmpVec3);
            this._joystickRoot.setPosition(this._tmpVec3);
        }

        this._applyStickFromTouch(local);
        this.node.emit('joystick-start', this.direction.clone(), this.magnitude);
    }

    private _onTouchMove(event: EventTouch): void {
        if (event.getID() !== this._touchId) {
            return;
        }
        const local = this._touchToLocal(event, this._tmpVec3);
        this._applyStickFromTouch(local);
        this.node.emit('joystick-move', this.direction.clone(), this.magnitude);
    }

    private _onTouchEnd(event: EventTouch): void {
        if (event.getID() !== this._touchId) {
            return;
        }
        this._touchId = -1;
        this.isTouching = false;
        this._resetVisual(this.resetOnRelease);
        this.node.emit('joystick-end');
    }

    /** 根据触摸点相对 JoystickRoot 中心的位置更新摇杆头 */
    private _applyStickFromTouch(touchLocalInArea: Vec3): void {
        if (!this._joystickRoot) {
            return;
        }

        const center = this._joystickRoot.position;
        const offsetX = touchLocalInArea.x - center.x;
        const offsetY = touchLocalInArea.y - center.y;
        const distance = Math.hypot(offsetX, offsetY);
        const clamped = Math.min(distance, this._radius);

        let normX = 0;
        let normY = 0;
        if (distance > 0.001) {
            normX = offsetX / distance;
            normY = offsetY / distance;
        }

        this.stick?.setPosition(normX * clamped, normY * clamped, 0);

        const rawMag = clamped / this._radius;
        if (rawMag < this.deadZone) {
            this.direction.set(0, 0);
            this.magnitude = 0;
            return;
        }

        this.direction.set(normX, normY);
        this.magnitude = rawMag;
    }

    private _resetVisual(resetRoot: boolean): void {
        this.direction.set(0, 0);
        this.magnitude = 0;
        this.stick?.setPosition(0, 0, 0);
        if (resetRoot && this._joystickRoot) {
            this._joystickRoot.setPosition(this._defaultRootPos);
        }
    }
}
