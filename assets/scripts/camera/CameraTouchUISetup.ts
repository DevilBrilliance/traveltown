import { director, Node } from 'cc';
import { CameraOrbitController } from './CameraOrbitController';
import { CameraTouchArea } from './CameraTouchArea';

/**
 * 绑定场景中手动放置的 CameraTouchUI 预制体。
 * 请在 mainCanvas 最下层放置 CameraTouchUI，并挂 CameraTouchArea 脚本。
 */
export function bindCameraTouchUI(orbitController: CameraOrbitController | null): CameraTouchArea | null {
    if (!orbitController) {
        return null;
    }

    const canvas = director.getScene()?.getChildByName('mainCanvas');
    if (!canvas) {
        console.warn('[CameraTouchUI] 未找到 mainCanvas');
        return null;
    }

    const touchNode = _findCameraTouchUI(canvas);
    if (!touchNode) {
        console.warn('[CameraTouchUI] 请在 mainCanvas 下放置 CameraTouchUI 预制体（层级低于 EasyTouch）');
        return null;
    }

    const touch = touchNode.getComponent(CameraTouchArea) ?? touchNode.addComponent(CameraTouchArea);
    touch.bindOrbitController(orbitController);
    return touch;
}

function _findCameraTouchUI(canvas: Node): Node | null {
    const direct = canvas.getChildByName('CameraTouchUI');
    if (direct) {
        return direct;
    }
    for (const child of canvas.children) {
        if (child.name === 'CameraTouchUI') {
            return child;
        }
    }
    return null;
}

/** @deprecated 使用 bindCameraTouchUI */
export function setupCameraTouchUI(orbitController: CameraOrbitController | null): CameraTouchArea | null {
    return bindCameraTouchUI(orbitController);
}
