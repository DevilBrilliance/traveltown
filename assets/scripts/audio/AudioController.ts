import {
    _decorator,
    assetManager,
    AudioClip,
    AudioSource,
    Component,
    director,
} from 'cc';
import { SOUND_PATHS, SoundEffect } from './SoundEffect';

const { ccclass, property } = _decorator;

@ccclass('AudioController')
export class AudioController extends Component {
    private static _instance: AudioController | null = null;

    /** 全局音效控制器实例 */
    public static get instance(): AudioController | null {
        return AudioController._instance;
    }

    @property({ tooltip: '默认音量 0~1' })
    defaultVolume = 1;

    private _sfxSource: AudioSource | null = null;
    private _bgmSource: AudioSource | null = null;
    private _loopSource: AudioSource | null = null;
    private _clipCache = new Map<SoundEffect, AudioClip>();
    private _loaded = false;
    private _muted = false;
    private _volume = 1;
    private _loopEffect: SoundEffect | null = null;

    onLoad() {
        if (AudioController._instance && AudioController._instance !== this) {
            this.node.destroy();
            return;
        }
        AudioController._instance = this;
        director.addPersistRootNode(this.node);

        this._volume = this.defaultVolume;
        this._sfxSource = this.node.addComponent(AudioSource);
        this._bgmSource = this.node.addComponent(AudioSource);
        this._loopSource = this.node.addComponent(AudioSource);
        this._bgmSource.loop = true;
        this._loopSource.loop = true;

        this._preloadClips();
    }

    onDestroy() {
        if (AudioController._instance === this) {
            AudioController._instance = null;
        }
    }

    /** 资源是否已全部加载 */
    public get isReady(): boolean {
        return this._loaded;
    }

    /** 当前是否静音 */
    public get isMuted(): boolean {
        return this._muted;
    }

    /** 静音 */
    public mute(): void {
        this._muted = true;
        this._applyVolume();
    }

    /** 开启声音 */
    public enableSound(): void {
        this._muted = false;
        this._applyVolume();
    }

    /** 切换静音状态 */
    public setMuted(muted: boolean): void {
        if (muted) {
            this.mute();
        } else {
            this.enableSound();
        }
    }

    /** 设置音量 0~1（静音时不生效，取消静音后恢复） */
    public setVolume(volume: number): void {
        this._volume = Math.max(0, Math.min(1, volume));
        if (!this._muted) {
            this._applyVolume();
        }
    }

    /**
     * 播放一次性音效
     * @param effect 音效枚举
     * @param volumeScale 相对音量倍率
     */
    public play(effect: SoundEffect, volumeScale = 1): void {
        if (this._muted) {
            return;
        }

        const clip = this._clipCache.get(effect);
        if (!clip) {
            console.warn(`[AudioController] 音效未加载: SoundEffect.${SoundEffect[effect]}`);
            return;
        }

        this._sfxSource?.playOneShot(clip, this._volume * volumeScale);
    }

    /** 播放背景音乐（循环） */
    public playBgm(effect: SoundEffect = SoundEffect.BgmHappyWaves, volumeScale = 1): void {
        const clip = this._clipCache.get(effect);
        if (!clip || !this._bgmSource) {
            console.warn(`[AudioController] BGM 未加载: SoundEffect.${SoundEffect[effect]}`);
            return;
        }

        if (this._bgmSource.playing && this._bgmSource.clip === clip) {
            return;
        }

        this._bgmSource.stop();
        this._bgmSource.clip = clip;
        this._bgmSource.volume = this._muted ? 0 : this._volume * volumeScale;
        this._bgmSource.play();
    }

    /** 停止背景音乐 */
    public stopBgm(): void {
        this._bgmSource?.stop();
    }

    /** 播放循环音效（如跑步声） */
    public playLoop(effect: SoundEffect, volumeScale = 1): void {
        const clip = this._clipCache.get(effect);
        if (!clip || !this._loopSource) {
            console.warn(`[AudioController] 循环音效未加载: SoundEffect.${SoundEffect[effect]}`);
            return;
        }

        if (this._loopSource.playing && this._loopEffect === effect) {
            return;
        }

        this._loopEffect = effect;
        this._loopSource.stop();
        this._loopSource.clip = clip;
        this._loopSource.volume = this._muted ? 0 : this._volume * volumeScale;
        this._loopSource.play();
    }

    /** 停止循环音效 */
    public stopLoop(): void {
        this._loopEffect = null;
        this._loopSource?.stop();
    }

    private _applyVolume(): void {
        const volume = this._muted ? 0 : this._volume;
        if (this._bgmSource) {
            this._bgmSource.volume = volume;
        }
        if (this._loopSource) {
            this._loopSource.volume = volume;
        }
    }

    private _preloadClips(): void {
        const bundle = assetManager.getBundle('main') ?? assetManager.main;
        if (!bundle) {
            console.error('[AudioController] 无法获取 main 资源包');
            return;
        }

        const entries = Object.entries(SOUND_PATHS) as [string, string][];
        let pending = entries.length;

        for (const [key, path] of entries) {
            bundle.load(path, AudioClip, (err, clip) => {
                pending -= 1;
                if (err) {
                    console.warn(`[AudioController] 加载失败: ${path}`, err);
                } else if (clip) {
                    this._clipCache.set(Number(key) as SoundEffect, clip);
                }

                if (pending <= 0) {
                    this._loaded = true;
                }
            });
        }
    }
}
