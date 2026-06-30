import {
    _decorator,
    BlockInputEvents,
    Color,
    Component,
    EventKeyboard,
    EventTouch,
    input,
    Input,
    KeyCode,
    Layers,
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
const BACKDROP_SPRITE_PATH = 'textures/atlas/whiteCirecle';

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

    @property({ tooltip: '启用 WASD / 方向键 键盘映射' })
    keyboardEnabled = true;

    @property({ tooltip: '键盘输入时同步移动摇杆头（未触摸时）' })
    syncStickWithKeyboard = true;

    /** 归一化方向 */
    public readonly direction = new Vec2();

    /** 偏移强度 0~1 */
    public magnitude = 0;

    public isTouching = false;

    /** 当前是否由键盘驱动输入 */
    public isKeyboardActive = false;

    private _touchArea: UITransform | null = null;
    private _joystickRoot: Node | null = null;
    private _defaultRootPos = new Vec3();
    private _radius = 60;
    private _touchId = -1;
    private readonly _tmpVec2 = new Vec2();
    private readonly _tmpVec3 = new Vec3();
    private readonly _keyState = {
        up: false,
        down: false,
        left: false,
        right: false,
    };

    onLoad() {
        this.node.layer = Layers.Enum.UI_2D;
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

        if (this.keyboardEnabled) {
            input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
            input.on(Input.EventType.KEY_UP, this._onKeyUp, this);
        }
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);

        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this._onKeyUp, this);
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
                this.background.layer = Layers.Enum.UI_2D;
                this.background.setPosition(0, 0, 0);
                this.background.parent = root;
            }
            if (this.stick) {
                this.stick.layer = Layers.Enum.UI_2D;
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
        root.layer = Layers.Enum.UI_2D;
        this._ensureOpaqueBackdrop(root);

        const centerAnchor = new Vec2(0.5, 0.5);
        this.background?.getComponent(UITransform)?.setAnchorPoint(centerAnchor);
        this.stick?.getComponent(UITransform)?.setAnchorPoint(centerAnchor);
    }

    /** 圆环背景中间透明，垫一层不透明底防止 3D 场景透出来 */
    private _ensureOpaqueBackdrop(root: Node): void {
        if (root.getChildByName('Backdrop')) {
            return;
        }

        const bgUi = this.background?.getComponent(UITransform);
        const size = bgUi ? Math.max(bgUi.width, bgUi.height) * 0.92 : 140;

        const node = new Node('Backdrop');
        node.layer = Layers.Enum.UI_2D;
        node.parent = root;
        node.setSiblingIndex(0);

        const ui = node.addComponent(UITransform);
        ui.setContentSize(size, size);
        ui.setAnchorPoint(0.5, 0.5);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.color = new Color(255, 255, 255, 255);

        resources.load(`${BACKDROP_SPRITE_PATH}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (err || !frame) {
                return;
            }
            sprite.spriteFrame = frame;
        });
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
        if (this.keyboardEnabled) {
            this._updateFromKeyboard();
        }
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
        this.isKeyboardActive = false;
        this.stick?.setPosition(0, 0, 0);
        if (resetRoot && this._joystickRoot) {
            this._joystickRoot.setPosition(this._defaultRootPos);
        }
    }

    private _onKeyDown(event: EventKeyboard): void {
        if (!this.keyboardEnabled || this.isTouching) {
            return;
        }
        if (this._applyKeyCode(event.keyCode, true)) {
            this._updateFromKeyboard();
        }
    }

    private _onKeyUp(event: EventKeyboard): void {
        if (!this.keyboardEnabled || this.isTouching) {
            return;
        }
        if (this._applyKeyCode(event.keyCode, false)) {
            this._updateFromKeyboard();
        }
    }

    private _applyKeyCode(code: KeyCode, pressed: boolean): boolean {
        switch (code) {
            case KeyCode.KEY_W:
            case KeyCode.ARROW_UP:
                this._keyState.up = pressed;
                return true;
            case KeyCode.KEY_S:
            case KeyCode.ARROW_DOWN:
                this._keyState.down = pressed;
                return true;
            case KeyCode.KEY_A:
            case KeyCode.ARROW_LEFT:
                this._keyState.left = pressed;
                return true;
            case KeyCode.KEY_D:
            case KeyCode.ARROW_RIGHT:
                this._keyState.right = pressed;
                return true;
            default:
                return false;
        }
    }

    /** WASD / 方向键 → direction + magnitude，与摇杆输出一致 */
    private _updateFromKeyboard(): void {
        if (this.isTouching) {
            return;
        }

        let x = 0;
        let y = 0;
        if (this._keyState.left) {
            x -= 1;
        }
        if (this._keyState.right) {
            x += 1;
        }
        if (this._keyState.up) {
            y += 1;
        }
        if (this._keyState.down) {
            y -= 1;
        }

        if (x === 0 && y === 0) {
            if (this.isKeyboardActive) {
                this.isKeyboardActive = false;
                this.direction.set(0, 0);
                this.magnitude = 0;
                if (this.syncStickWithKeyboard) {
                    this.stick?.setPosition(0, 0, 0);
                }
                this.node.emit('joystick-end');
            }
            return;
        }

        const len = Math.hypot(x, y);
        const normX = x / len;
        const normY = y / len;

        this.direction.set(normX, normY);
        this.magnitude = 1;

        if (this.syncStickWithKeyboard) {
            this.stick?.setPosition(normX * this._radius, normY * this._radius, 0);
        }

        if (!this.isKeyboardActive) {
            this.isKeyboardActive = true;
            this.node.emit('joystick-start', this.direction.clone(), this.magnitude);
            return;
        }
        this.node.emit('joystick-move', this.direction.clone(), this.magnitude);
    }
}
