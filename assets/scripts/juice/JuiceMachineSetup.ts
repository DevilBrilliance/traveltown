import { Node, Vec3 } from 'cc';
import { IslandSurfaceSampler } from '../scene/IslandSurfaceSampler';
import { JuiceMachine } from './JuiceMachine';
import { JuiceMachineAnimator } from './JuiceMachineAnimator';

/** 榨汁机旁投料区默认世界坐标（XZ；Y 会按底板顶面自动抬高） */
export const JUICE_MACHINE_ZONE_POSITION = new Vec3(26, 0, -10);

/**
 * 在 Island 上创建榨汁机投料区，并关联 JiQi_RIG / ZhaLan_Box。
 * 默认 inactive，收银台解锁后调用 JuiceMachine.activate()。
 */
export class JuiceMachineSetup {
    public static ensureOnIsland(
        island: Node | null,
        worldPosition: Vec3 = JUICE_MACHINE_ZONE_POSITION,
        machineRig: Node | null = null,
        outputRack: Node | null = null,
    ): JuiceMachine | null {
        if (!island) {
            console.warn('[JuiceMachineSetup] 未找到 Island');
            return null;
        }

        if (!machineRig?.isValid) {
            console.warn('[JuiceMachineSetup] 请在 GameStart 绑定 juiceMachineRig (JiQi_RIG)');
            return null;
        }
        if (!outputRack?.isValid) {
            console.warn('[JuiceMachineSetup] 请在 GameStart 绑定 juiceOutputRack (ZhaLan_Box)');
            return null;
        }

        machineRig.getComponent(JuiceMachineAnimator) ?? machineRig.addComponent(JuiceMachineAnimator);

        let zoneNode = island.getChildByName('JuiceMachineZone');
        if (!zoneNode) {
            zoneNode = new Node('JuiceMachineZone');
            zoneNode.setParent(island);
        }

        const snapped = IslandSurfaceSampler.snapWorldPositionToSurface(
            worldPosition,
            island,
            0,
        );
        zoneNode.setWorldPosition(snapped);

        const machine = zoneNode.getComponent(JuiceMachine) ?? zoneNode.addComponent(JuiceMachine);
        machine.machineRef = machineRig;
        machine.outputRack = outputRack;

        if (!machine.isActivated) {
            zoneNode.active = false;
        }

        machine.scheduleOnce(() => {
            if (!zoneNode.isValid) {
                return;
            }
            const resnapped = IslandSurfaceSampler.snapWorldPositionToSurface(
                worldPosition.clone(),
                island,
                0,
            );
            zoneNode.setWorldPosition(resnapped);
        }, 0.2);

        return machine;
    }
}
