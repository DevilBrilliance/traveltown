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

/** 与 JiQi_RIG 内置 Take 001 区分，避免播到错误片段 */
const RUN_CLIP_NAME = 'JiQi_YunXing';

/**
 * 榨汁机骨骼运行动画：有料且未满杯时在 JiQi_RIG 上循环播放 JiQi_YunXing。
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
            if (!clip) {
                console.warn('[JuiceMachineAnimator] JiQi_YunXing 动画加载失败');
                return;
            }
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
        this._toggleStaticShell(running);
        if (!running) {
            this._stop();
            return;
        }
        if (this._clipReady) {
            this._playLoop();
            return;
        }
        JuiceMachineAnimator._ensureClip((clip) => {
            this._clipReady = !!clip;
            if (clip && this._running) {
                this._playLoop();
            }
        });
    }

    /** 场景里 JiQi 静态壳与 JiQi_RIG 重叠，运行时隐藏静态模型 */
    private _toggleStaticShell(running: boolean): void {
        const shell = this.node.parent?.getChildByName('JiQi');
        if (shell?.isValid) {
            shell.active = !running;
        }
    }

    private _ensureSkeletal(): SkeletalAnimation | null {
        let skeletal = this.getComponent(SkeletalAnimation)
            ?? this.getComponentInChildren(SkeletalAnimation);
        if (!skeletal) {
            skeletal = this.node.addComponent(SkeletalAnimation);
        }

        const renderer = this._findSkinnedRenderer();
        if (renderer?.skinningRoot) {
            skeletal.skinningRoot = renderer.skinningRoot;
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

        if (!skeletal.getState(RUN_CLIP_NAME)) {
            skeletal.addClip(clip, RUN_CLIP_NAME);
        }

        const animState = skeletal.getState(RUN_CLIP_NAME);
        if (animState) {
            animState.wrapMode = AnimationClip.WrapMode.Loop;
            animState.repeatCount = Infinity;
        }

        skeletal.play(RUN_CLIP_NAME);
    }

    private _stop(): void {
        const skeletal = this._ensureSkeletal();
        if (!skeletal) {
            return;
        }
        if (skeletal.getState(RUN_CLIP_NAME)) {
            skeletal.stop();
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

        const finish = (clip: AnimationClip | null) => {
            JuiceMachineAnimator._clip = clip;
            JuiceMachineAnimator._loading = false;
            const cbs = JuiceMachineAnimator._callbacks.splice(0);
            for (const cb of cbs) {
                cb(clip);
            }
        };

        const subPath = `${JUICE_MACHINE_RUN_ANIM_PATH}/${CHARACTER_ANIM_CLIP_SUB_NAME}`;
        resources.load(subPath, AnimationClip, (err, clip) => {
            if (!err && clip) {
                finish(clip);
                return;
            }
            resources.load(JUICE_MACHINE_RUN_ANIM_PATH, AnimationClip, (err2, clip2) => {
                if (!err2 && clip2) {
                    finish(clip2);
                    return;
                }
                assetManager.loadAny(
                    { uuid: JUICE_MACHINE_RUN_CLIP_UUID, type: AnimationClip },
                    (err3, asset) => {
                        if (err3 || !asset) {
                            console.warn(
                                '[JuiceMachineAnimator] 加载 JiQi_YunXing 失败',
                                err3 ?? err2 ?? err,
                            );
                            finish(null);
                            return;
                        }
                        finish(asset as AnimationClip);
                    },
                );
            });
        });
    }
}
