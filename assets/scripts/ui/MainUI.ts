import {
    _decorator,
    Camera,
    Canvas,
    Component,
    director,
    instantiate,
    Layers,
    Prefab,
    resources,
    UITransform,
    Vec3,
    Widget,
} from 'cc';

const { ccclass, property } = _decorator;

const EASY_TOUCH_PREFAB = 'prefabs/EasyTouch';
const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 640;

/**
 * 主界面 UI 根节点：全屏 Canvas，左下角挂载 EasyTouch 摇杆。
 */
@ccclass('MainUI')
export class MainUI extends Component {
    @property({ type: Camera, tooltip: 'UI 渲染相机，由 MainCtrl 传入或编辑器指定' })
    uiCamera: Camera | null = null;

    @property({ tooltip: '摇杆距屏幕左下角的边距（设计分辨率像素）' })
    edgeMargin = 36;

    onLoad() {
        this._setupCanvas();
        this._spawnEasyTouch();
    }

    private _setupCanvas(): void {
        this.node.setPosition(Vec3.ZERO);

        const uiTransform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        uiTransform.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
        uiTransform.setAnchorPoint(0.5, 0.5);

        let canvas = this.node.getComponent(Canvas);
        if (!canvas) {
            canvas = this.node.addComponent(Canvas);
        }
        canvas.alignCanvasWithScreen = true;

        const camera = this.uiCamera ?? this._findMainCamera();
        if (camera) {
            camera.visibility |= Layers.Enum.UI_2D;
            canvas.cameraComponent = camera;
        }
    }

    private _findMainCamera(): Camera | null {
        const camNode = director.getScene()?.getChildByName('Main Camera');
        return camNode?.getComponent(Camera) ?? null;
    }

    private _spawnEasyTouch(): void {
        resources.load(EASY_TOUCH_PREFAB, Prefab, (err, prefab) => {
            if (err || !prefab) {
                console.error('[MainUI] EasyTouch 预制体加载失败', err);
                return;
            }

            const joystick = instantiate(prefab);
            joystick.name = 'EasyTouch';
            joystick.parent = this.node;

            const rootTransform = joystick.getComponent(UITransform);
            rootTransform?.setAnchorPoint(0, 0);

            const widget = joystick.getComponent(Widget) ?? joystick.addComponent(Widget);
            widget.isAlignLeft = true;
            widget.isAlignBottom = true;
            widget.isAbsoluteLeft = true;
            widget.isAbsoluteBottom = true;
            widget.left = this.edgeMargin;
            widget.bottom = this.edgeMargin;
            widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
            widget.updateAlignment();
        });
    }
}
