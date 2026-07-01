import { Node, SkeletalAnimation, SkinnedMeshRenderer, Vec3 } from 'cc';

/** 后背堆叠 Socket 路径：Chest_M 比 Spine1_M 更靠上背 */
export const CHARACTER_BACK_SOCKET_PATH =
    'Group/DeformationSystem/Root_M/Spine1_M/Chest_M';

/** 端托盘时托盘跟随的骨骼（双手前方） */
export const CHARACTER_PLATE_SOCKET_PATH =
    'Group/DeformationSystem/Root_M/Spine1_M/Chest_M';

/**
 * 注册 SkeletalAnimation Socket（挂点），使 target 节点每帧跟随骨骼。
 * 注意：不能把物体直接 parent 到骨骼节点，必须通过 Socket。
 */
export function ensureCharacterBoneSocket(
    characterRoot: Node,
    bonePath: string,
    socketNodeName: string,
    localOffset = new Vec3(),
    localEuler = new Vec3(),
): Node | null {
    const skeletal = _resolveSkeletalAnimation(characterRoot);
    if (!skeletal) {
        return null;
    }

    for (const socket of skeletal.sockets) {
        if (socket.path === bonePath && socket.target?.isValid) {
            socket.target.name = socketNodeName;
            socket.target.setPosition(localOffset);
            socket.target.setRotationFromEuler(localEuler);
            return socket.target;
        }
    }

    const target = new Node(socketNodeName);
    target.setParent(characterRoot);
    target.setPosition(localOffset);
    target.setRotationFromEuler(localEuler);

    const nextSockets = skeletal.sockets.slice();
    nextSockets.push(new SkeletalAnimation.Socket(bonePath, target));
    skeletal.sockets = nextSockets;

    return target;
}

export function findCharacterBone(characterRoot: Node, boneName: string): Node | null {
    const stack: Node[] = [characterRoot];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (current.name === boneName) {
            return current;
        }
        for (let i = current.children.length - 1; i >= 0; i -= 1) {
            stack.push(current.children[i]);
        }
    }
    return null;
}

function _resolveSkeletalAnimation(characterRoot: Node): SkeletalAnimation | null {
    let skeletal = characterRoot.getComponent(SkeletalAnimation);
    if (!skeletal) {
        skeletal = characterRoot.addComponent(SkeletalAnimation);
    }

    if (!skeletal.skinningRoot) {
        const renderers = characterRoot.getComponentsInChildren(SkinnedMeshRenderer);
        for (const renderer of renderers) {
            if (renderer.node.activeInHierarchy && renderer.skinningRoot) {
                skeletal.skinningRoot = renderer.skinningRoot;
                break;
            }
        }
    }

    if (!skeletal.skinningRoot) {
        console.warn('[CharacterSocketHelper] skinningRoot 未就绪');
        return null;
    }
    return skeletal;
}
