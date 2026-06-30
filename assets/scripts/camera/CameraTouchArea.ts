import {
    _decorator,
    BlockInputEvents,
    Component,
    EventMouse,
    EventTouch,
    input,
    Input,
    Node,
    sys,
    UITransform,
    Vec2,
    Widget,
} from 'cc';
import { CameraOrbitController } from './CameraOrbitController';

const { ccclass, property } = _decorator;

interface TouchRecord {
    start: Vec2;
    last: Vec2;
    dragReady: boolean;
}

/**
 * 相机触控区
 *
 * 挂到 mainCanvas 最下层的 CameraTouchUI（全屏 + BlockInputEvents）。
 * 上层 EasyTouch / MainUI 会优先接收点击，空白区域由本节点接收。
 *
 * - PC / 编辑器：鼠标左键拖拽旋转，滚轮缩放
 * - 移动端：单指拖拽旋转，双指捏合缩放
 */
@ccclass('CameraTouchArea')
export class CameraTouchArea extends Component {
    @property({ type: CameraOrbitController, tooltip: '轨道相机' })
    orbitController: CameraOrbitController | null = null;

    @property({ tooltip: '拖拽旋转灵敏度（度/像素）' })
    rotateSensitivity = 0.22;

    @property({ tooltip: '双指捏合缩放灵敏度' })
    pinchSensitivity = 0.04;

    @property({ tooltip: '滚轮缩放灵敏度（比例）' })
    wheelSensitivity = 0.045;

    @property({ tooltip: '开始旋转前最小拖拽距离（像素）' })
    rotateDeadZone = 6;

    /** 非移动端走鼠标，移动端走 Touch，避免编辑器里双通道重复 */
    private _useMouse = false;

    private readonly _touches = new Map<number, TouchRecord>();
    private readonly _tmpVec2 = new Vec2();
    private readonly _mouseStart = new Vec2();
    private readonly _mouseLast = new Vec2();
    /** 本节点收到 MOUSE_DOWN 后为 true，直到 MOUSE_UP 或检测到未按键移动 */
    private _mouseDown = false;
    private _mouseDragReady = false;
    private _pinchLastDistance = 0;

    onLoad() {
        this._useMouse = !sys.isMobile;
        this._ensureFullScreenHitArea();

        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);

        this.node.on(Node.EventType.MOUSE_DOWN, this._onMouseDown, this);
        this.node.on(Node.EventType.MOUSE_MOVE, this._onMouseMove, this);
        this.node.on(Node.EventType.MOUSE_UP, this._onMouseUp, this);
        this.node.on(Node.EventType.MOUSE_WHEEL, this._onMouseWheel, this);

        input.on(Input.EventType.MOUSE_UP, this._onGlobalMouseUp, this);
        input.on(Input.EventType.MOUSE_MOVE, this._onGlobalMouseMove, this);

        input.on(Input.EventType.TOUCH_END, this._onGlobalTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onGlobalTouchEnd, this);
    }

    start() {
        this._resolveOrbitController();
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
        this.node.off(Node.EventType.MOUSE_DOWN, this._onMouseDown, this);
        this.node.off(Node.EventType.MOUSE_MOVE, this._onMouseMove, this);
        this.node.off(Node.EventType.MOUSE_UP, this._onMouseUp, this);
        this.node.off(Node.EventType.MOUSE_WHEEL, this._onMouseWheel, this);
        input.off(Input.EventType.MOUSE_UP, this._onGlobalMouseUp, this);
        input.off(Input.EventType.MOUSE_MOVE, this._onGlobalMouseMove, this);

        input.off(Input.EventType.TOUCH_END, this._onGlobalTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onGlobalTouchEnd, this);
    }

    onDisable() {
        this._resetMouseDrag();
        this._touches.clear();
        this._pinchLastDistance = 0;
    }

    public bindOrbitController(controller: CameraOrbitController | null): void {
        this.orbitController = controller;
    }

    private _ensureFullScreenHitArea(): void {
        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }
        const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        if (ui.contentSize.width < 100) {
            ui.setContentSize(960, 640);
        }
        let widget = this.node.getComponent(Widget);
        if (!widget) {
            widget = this.node.addComponent(Widget);
            widget.isAlignLeft = true;
            widget.isAlignRight = true;
            widget.isAlignTop = true;
            widget.isAlignBottom = true;
            widget.left = 0;
            widget.right = 0;
            widget.top = 0;
            widget.bottom = 0;
            widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        }
    }

    private _resolveOrbitController(): void {
        if (this.orbitController) {
            return;
        }
        const cameraNode = this.node.scene?.getChildByName('Main Camera');
        this.orbitController = cameraNode?.getComponent(CameraOrbitController) ?? null;
    }

    // ── 鼠标（PC / 编辑器预览） ──

    private _onMouseDown(event: EventMouse): void {
        if (!this._useMouse || event.getButton() !== EventMouse.BUTTON_LEFT) {
            return;
        }
        this._mouseDown = true;
        this._mouseDragReady = false;
        const pos = event.getUILocation(this._mouseStart);
        this._mouseLast.set(pos);
    }

    private _onMouseMove(event: EventMouse): void {
        if (!this._useMouse) {
            return;
        }
        this._processMouseDrag(event);
    }

    /** 拖拽越过节点边界时，节点 MOUSE_MOVE 会停发，需靠全局 MOVE 继续跟手 */
    private _onGlobalMouseMove(event: EventMouse): void {
        if (!this._useMouse || !this._mouseDown) {
            return;
        }
        this._processMouseDrag(event);
    }

    private _processMouseDrag(event: EventMouse): void {
        const button = event.getButton();
        // Cocos 3.8：未按键悬停移动时 getButton() === BUTTON_MISSING
        if (button === EventMouse.BUTTON_MISSING) {
            this._resetMouseDrag();
            return;
        }
        if (!this._mouseDown || button !== EventMouse.BUTTON_LEFT) {
            return;
        }

        const pos = event.getUILocation(this._tmpVec2);
        if (!this._mouseDragReady) {
            if (Vec2.distance(this._mouseStart, pos) < this.rotateDeadZone) {
                return;
            }
            this._mouseDragReady = true;
            this._mouseLast.set(pos);
            return;
        }
        this._applyRotate(pos.x - this._mouseLast.x, pos.y - this._mouseLast.y);
        this._mouseLast.set(pos);
    }

    private _onMouseUp(_event: EventMouse): void {
        this._resetMouseDrag();
    }

    private _onGlobalMouseUp(_event: EventMouse): void {
        this._resetMouseDrag();
    }

    private _resetMouseDrag(): void {
        this._mouseDown = false;
        this._mouseDragReady = false;
    }

    private _onMouseWheel(event: EventMouse): void {
        this.orbitController?.applyWheelZoom(event.getScrollY(), this.wheelSensitivity);
    }

    // ── 触摸（移动端） ──

    private _onTouchStart(event: EventTouch): void {
        if (this._useMouse) {
            return;
        }

        const uiPos = event.getUILocation(this._tmpVec2);
        const id = event.getID();
        this._touches.set(id, {
            start: uiPos.clone(),
            last: uiPos.clone(),
            dragReady: false,
        });

        if (this._touches.size >= 2) {
            this._pinchLastDistance = this._getPinchDistance();
        }
    }

    private _onTouchMove(event: EventTouch): void {
        if (this._useMouse) {
            return;
        }

        const id = event.getID();
        const record = this._touches.get(id);
        if (!record) {
            return;
        }

        const uiPos = event.getUILocation(this._tmpVec2);
        record.last.set(uiPos);

        if (this._touches.size >= 2) {
            this._applyPinch();
            return;
        }

        if (this._touches.size !== 1) {
            return;
        }

        if (!record.dragReady) {
            if (Vec2.distance(record.start, uiPos) < this.rotateDeadZone) {
                return;
            }
            record.dragReady = true;
            record.last.set(uiPos);
            return;
        }

        this._applyRotate(uiPos.x - record.last.x, uiPos.y - record.last.y);
        record.last.set(uiPos);
    }

    private _onTouchEnd(event: EventTouch): void {
        if (this._useMouse) {
            return;
        }
        this._removeTouch(event.getID());
    }

    /** 手指在其它 UI 上抬起时，节点 TOUCH_END 可能收不到 */
    private _onGlobalTouchEnd(event: EventTouch): void {
        if (this._useMouse) {
            return;
        }
        this._removeTouch(event.getID());
    }

    private _removeTouch(id: number): void {
        this._touches.delete(id);
        if (this._touches.size <= 1) {
            this._pinchLastDistance = 0;
        } else if (this._touches.size >= 2) {
            this._pinchLastDistance = this._getPinchDistance();
        }
    }

    // ── 相机 ──

    private _applyRotate(deltaX: number, deltaY: number): void {
        if (!this.orbitController) {
            return;
        }
        this.orbitController.addYawDelta(deltaX * this.rotateSensitivity);
        this.orbitController.addPitchDelta(-deltaY * this.rotateSensitivity);
    }

    private _applyPinch(): void {
        const distance = this._getPinchDistance();
        if (this._pinchLastDistance > 0) {
            const delta = distance - this._pinchLastDistance;
            this.orbitController?.addDistanceDelta(-delta * this.pinchSensitivity);
        }
        this._pinchLastDistance = distance;
    }

    private _getPinchDistance(): number {
        const points: Vec2[] = [];
        for (const record of this._touches.values()) {
            points.push(record.last);
        }
        if (points.length < 2) {
            return 0;
        }
        return Vec2.distance(points[0], points[1]);
    }
}
