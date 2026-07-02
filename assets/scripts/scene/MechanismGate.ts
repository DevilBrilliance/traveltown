import { Node, NodeSpace, Quat } from 'cc';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';

/**
 * 机关双开门：绕门扇本地 Y 轴旋转。
 * Men / Men-001 默认相差 180° 朝向，两扇填相同角度时会自动对反向门取反，保证对称外开。
 */
export class MechanismGate {
    private static readonly _deltaQuat = new Quat();

    /** 瞬间开门，可选播放音效 */
    public static open(
        door1: Node | null,
        door2: Node | null,
        door1DeltaY = -90,
        door2DeltaY = -90,
        playSound = true,
    ): void {
        if (playSound) {
            AudioController.ensure().play(SoundEffect.OpenDoor);
        }
        const door2Resolved = MechanismGate._resolveDoor2Delta(door2, door1DeltaY, door2DeltaY);
        MechanismGate._rotateLocalY(door1, door1DeltaY);
        MechanismGate._rotateLocalY(door2, door2Resolved);
    }

    /**
     * 反向朝向的门（本地 Y≈180°）若与门1配置相同角度，则取反，避免一扇外开一扇内开。
     */
    private static _resolveDoor2Delta(
        door2: Node | null,
        door1DeltaY: number,
        door2DeltaY: number,
    ): number {
        if (!door2?.isValid) {
            return door2DeltaY;
        }
        if (!MechanismGate._isOppositeFacing(door2)) {
            return door2DeltaY;
        }
        if (Math.abs(door2DeltaY - door1DeltaY) < 0.01) {
            return -door2DeltaY;
        }
        return door2DeltaY;
    }

    private static _isOppositeFacing(door: Node): boolean {
        const y = MechanismGate._normalizeEulerY(door.eulerAngles.y);
        return Math.abs(y) > 90;
    }

    private static _normalizeEulerY(y: number): number {
        let normalized = y % 360;
        if (normalized > 180) {
            normalized -= 360;
        }
        if (normalized < -180) {
            normalized += 360;
        }
        return normalized;
    }

    private static _rotateLocalY(door: Node | null, deltaY: number): void {
        if (!door?.isValid || Math.abs(deltaY) < 1e-4) {
            return;
        }
        Quat.fromEuler(MechanismGate._deltaQuat, 0, deltaY, 0);
        door.rotate(MechanismGate._deltaQuat, NodeSpace.LOCAL);
    }
}
