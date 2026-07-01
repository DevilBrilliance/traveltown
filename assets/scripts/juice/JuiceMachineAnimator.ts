import {
    _decorator,
    AnimationClip,
    assetManager,
    Component,
    resources,
    SkeletalAnimation,
    SkinnedMeshRenderer,
} from 'cc';
import { CHARACTER_ANIM_CLIP_SUB_NAME } from '../character/CharacterAnimState';
import {
    JUICE_MACHINE_RUN_ANIM_PATH,
    JUICE_MACHINE_RUN_CLIP_UUID,
} from './JuiceMachinePaths';

const { ccclass } = _decorator;

/**
 * 榨汁机骨骼运行动画：有料且未满杯时循环播放 JiQi_YunXing。
 */
@ccclass('JuiceMachineAnimator')
export class JuiceMachineAnimator extends Component {
    private static _clip: AnimationClip | null = null;
    private static _loading = false;
    private static _callbacks: Array<(clip: AnimationClip | null) => void> = [];

    private _skeletal: SkeletalAnimation | null = null;
    private _running = false;
    private _clipReady = false;

    onLoad() {
        JuiceMachineAnimator._ensureClip((clip) => {
            this._clipReady = !!clip;
            if (this._running) {
                this._playLoop();
            }
        });
    }

    public setRunning(running: boolean): void {
        if (this._running === running) {
            return;
        }
        this._running = running;
        if (!running) {
            this._stop();
            return;
        }
        if (this._clipReady) {
            this._playLoop();
        }
    }

    private _ensureSkeletal(): SkeletalAnimation | null {
        if (this._skeletal?.isValid) {
            return this._skeletal;
        }
        let skeletal = this.getComponent(SkeletalAnimation)
            ?? this.getComponentInChildren(SkeletalAnimation);
        if (!skeletal) {
            skeletal = this.node.addComponent(SkeletalAnimation);
            const renderer = this._findSkinnedRenderer();
            if (renderer?.skinningRoot) {
                skeletal.skinningRoot = renderer.skinningRoot;
            }
        }
        this._skeletal = skeletal;
        return skeletal;
    }

    private _findSkinnedRenderer(): SkinnedMeshRenderer | null {
        const renderers = this.node.getComponentsInChildren(SkinnedMeshRenderer);
        for (const renderer of renderers) {
            if (renderer.node.activeInHierarchy) {
                return renderer;
            }
        }
        return renderers[0] ?? null;
    }

    private _playLoop(): void {
        const skeletal = this._ensureSkeletal();
        const clip = JuiceMachineAnimator._clip;
        if (!skeletal || !clip) {
            return;
        }
        const state = skeletal.getState(clip.name);
        if (!state) {
            skeletal.addClip(clip);
        }
        skeletal.play(clip.name);
        const animState = skeletal.getState(clip.name);
        if (animState) {
            animState.wrapMode = AnimationClip.WrapMode.Loop;
        }
    }

    private _stop(): void {
        const skeletal = this._ensureSkeletal();
        if (!skeletal) {
            return;
        }
        skeletal.stop();
    }

    private static _ensureClip(onReady: (clip: AnimationClip | null) => void): void {
        if (JuiceMachineAnimator._clip) {
            onReady(JuiceMachineAnimator._clip);
            return;
        }
        JuiceMachineAnimator._callbacks.push(onReady);
        if (JuiceMachineAnimator._loading) {
            return;
        }
        JuiceMachineAnimator._loading = true;

        resources.load(`${JUICE_MACHINE_RUN_ANIM_PATH}/${CHARACTER_ANIM_CLIP_SUB_NAME}`, AnimationClip, (err, clip) => {
            if (!err && clip) {
                JuiceMachineAnimator._finish(clip);
                return;
            }
            assetManager.loadAny({ uuid: JUICE_MACHINE_RUN_CLIP_UUID, type: AnimationClip }, (err2, asset) => {
                JuiceMachineAnimator._finish(!err2 && asset ? asset as AnimationClip : null);
            });
        });
    }

    private static _finish(clip: AnimationClip | null): void {
        JuiceMachineAnimator._clip = clip;
        JuiceMachineAnimator._loading = false;
        const cbs = JuiceMachineAnimator._callbacks.splice(0);
        for (const cb of cbs) {
            cb(clip);
        }
    }
}
