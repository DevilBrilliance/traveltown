import { Node, Vec3 } from 'cc';
import { IslandSurfaceSampler } from '../scene/IslandSurfaceSampler';
import { JuiceMachine } from './JuiceMachine';
import { JuiceMachineAnimator } from './JuiceMachineAnimator';

/** 榨汁机旁投料区默认世界坐标（XZ；Y 会按底板顶面自动抬高） */
export const JUICE_MACHINE_ZONE_POSITION = new Vec3(26, 0, -10);

function findChildDeep(root: Node, name: string): Node | null {
    if (root.name === name) {
        return root;
    }
    for (const child of root.children) {
        const found = findChildDeep(child, name);
        if (found) {
            return found;
        }
    }
    return null;
}

/**
 * 在 Island 上创建榨汁机投料区，并关联 JiQi_RIG / ZhaLan_Box。
 * 默认 inactive，收银台解锁后调用 JuiceMachine.activate()。
 */
export class JuiceMachineSetup {
    public static ensureOnIsland(
        island: Node | null,
        worldPosition: Vec3 = JUICE_MACHINE_ZONE_POSITION,
    ): JuiceMachine | null {
        if (!island) {
            console.warn('[JuiceMachineSetup] 未找到 Island');
            return null;
        }

        const rig = findChildDeep(island, 'JiQi_RIG');
        const rack = findChildDeep(island, 'ZhaLan_Box');
        if (!rig) {
            console.warn('[JuiceMachineSetup] 未找到 JiQi_RIG');
            return null;
        }
        if (!rack) {
            console.warn('[JuiceMachineSetup] 未找到 ZhaLan_Box');
            return null;
        }

        rig.getComponent(JuiceMachineAnimator) ?? rig.addComponent(JuiceMachineAnimator);

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
        machine.machineRef = rig;
        machine.outputRack = rack;

        if (!machine.isActivated) {
            zoneNode.active = false;
        }

        // 场景底板包围盒稍后才就绪，延迟再贴一次表面
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
