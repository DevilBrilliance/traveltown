import {
    _decorator,
    AnimationClip,
    assetManager,
    Component,
    Enum,
    Node,
    resources,
    SkeletalAnimation,
    SkinnedMeshRenderer,
} from 'cc';
import {
    CHARACTER_ANIM_CLIP_SUB_NAME,
    CHARACTER_ANIM_CLIP_UUIDS,
    CHARACTER_ANIM_PATHS,
    CharacterAnimState,
} from './CharacterAnimState';

const { ccclass, property } = _decorator;

type ClipCallback = (clip: AnimationClip | null) => void;

/**
 * 角色动画状态机
 * 挂载在 NPC_RIG 根节点，传入动画枚举即可切换播放。
 */
@ccclass('CharacterAnimController')
export class CharacterAnimController extends Component {
    @property({ type: Enum(CharacterAnimState), tooltip: '创建后默认动画（未手动 play 时使用）' })
    defaultState = CharacterAnimState.PlayerIdle;

    @property({ tooltip: '状态切换交叉淡入时长（秒），0 为立即切换' })
    crossFadeDuration = 0.15;

    private static _clipCache = new Map<CharacterAnimState, AnimationClip>();
    private static _loadingCallbacks = new Map<CharacterAnimState, ClipCallback[]>();

    private _skeletal: SkeletalAnimation | null = null;
    private _currentState: CharacterAnimState | null = null;
    private _started = false;

    public get currentState(): CharacterAnimState | null {
        return this._currentState;
    }

    onLoad() {
        this.node.on('appearance-changed', this._onAppearanceChanged, this);
    }

    start() {
        if (this._started) {
            return;
        }
        this._started = true;
        if (this._currentState === null) {
            this.play(this.defaultState);
        }
    }

    onDestroy() {
        this.node.off('appearance-changed', this._onAppearanceChanged, this);
    }

    /** 在指定角色节点上播放动画 */
    public static playOn(target: Node, state: CharacterAnimState): void {
        const controller = target.getComponent(CharacterAnimController)
            ?? target.addComponent(CharacterAnimController);
        controller.play(state);
    }

    /** 切换并播放动画状态 */
    public play(state: CharacterAnimState, force = false): void {
        if (!force && this._currentState === state) {
            return;
        }

        this._ensureSkeletalAnimation();
        if (!this._skeletal) {
            console.warn('[CharacterAnimController] 未找到可用的 SkinnedMeshRenderer');
            return;
        }

        CharacterAnimController._loadClip(state, (clip) => {
            if (!clip || !this.isValid || !this._skeletal) {
                return;
            }
            this._playClip(state, clip);
        });
    }

    private _playClip(state: CharacterAnimState, clip: AnimationClip): void {
        const skeletal = this._skeletal!;
        const clipName = CharacterAnimState[state];

        if (!skeletal.getState(clipName)) {
            skeletal.addClip(clip, clipName);
        }

        if (this._currentState === null || this.crossFadeDuration <= 0) {
            skeletal.play(clipName);
        } else {
            skeletal.crossFade(clipName, this.crossFadeDuration);
        }

        this._currentState = state;
    }

    private _ensureSkeletalAnimation(): void {
        let skeletal = this.node.getComponent(SkeletalAnimation);
        if (!skeletal) {
            skeletal = this.node.addComponent(SkeletalAnimation);
        }

        const renderer = this._findActiveSkinnedMeshRenderer();
        if (renderer?.skinningRoot) {
            skeletal.skinningRoot = renderer.skinningRoot;
        }

        this._skeletal = skeletal;
    }

    private _findActiveSkinnedMeshRenderer(): SkinnedMeshRenderer | null {
        const renderers = this.node.getComponentsInChildren(SkinnedMeshRenderer);
        for (const renderer of renderers) {
            if (renderer.node.activeInHierarchy) {
                return renderer;
            }
        }
        return renderers[0] ?? null;
    }

    private _onAppearanceChanged(): void {
        this._ensureSkeletalAnimation();
        if (this._currentState !== null) {
            this.play(this._currentState, true);
        }
    }

    private static _loadClip(state: CharacterAnimState, onLoaded: ClipCallback): void {
        const cached = CharacterAnimController._clipCache.get(state);
        if (cached) {
            onLoaded(cached);
            return;
        }

        const pending = CharacterAnimController._loadingCallbacks.get(state);
        if (pending) {
            pending.push(onLoaded);
            return;
        }
        CharacterAnimController._loadingCallbacks.set(state, [onLoaded]);

        const finish = (clip: AnimationClip | null) => {
            if (clip) {
                CharacterAnimController._clipCache.set(state, clip);
            }
            const callbacks = CharacterAnimController._loadingCallbacks.get(state) ?? [];
            CharacterAnimController._loadingCallbacks.delete(state);
            callbacks.forEach((cb) => cb(clip));
        };

        const path = CHARACTER_ANIM_PATHS[state];
        const subPath = `${path}/${CHARACTER_ANIM_CLIP_SUB_NAME}`;

        resources.load(subPath, AnimationClip, (err, clip) => {
            if (!err && clip) {
                finish(clip);
                return;
            }

            resources.load(path, AnimationClip, (err2, clip2) => {
                if (!err2 && clip2) {
                    finish(clip2);
                    return;
                }

                assetManager.loadAny(
                    { uuid: CHARACTER_ANIM_CLIP_UUIDS[state], type: AnimationClip },
                    (err3, asset) => {
                        if (err3 || !asset) {
                            console.error(
                                `[CharacterAnimController] 加载动画失败: ${CharacterAnimState[state]}`,
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
