import {
    _decorator,
    Component,
    director,
    Node,
} from 'cc';
import { AudioController } from '../audio/AudioController';
import { SoundEffect } from '../audio/SoundEffect';
import { CurrencyType } from '../currency/CurrencyType';
import { CurrencyWallet } from '../currency/CurrencyWallet';
import { GameSceneRefs } from '../scene/GameSceneRefs';

const { ccclass, property } = _decorator;

/**
 * 地面钱币拾取：玩家进入拾取半径后增加金币并播放音效。
 */
@ccclass('MoneyPickup')
export class MoneyPickup extends Component {
    @property({ tooltip: '拾取半径（XZ 平面距离）' })
    collectRadius = 1.2;

    @property({ tooltip: '拾取获得金币数量' })
    amount = 10;

    @property({ type: Node, tooltip: '玩家节点，不填则查找 Protagonist' })
    playerNode: Node | null = null;

    private _collected = false;

    update(): void {
        if (this._collected) {
            return;
        }
        const player = this._resolvePlayer();
        if (!player || !this._isPlayerInRange(player)) {
            return;
        }
        this._collect();
    }

    private _isPlayerInRange(player: Node): boolean {
        const pp = player.worldPosition;
        const wp = this.node.worldPosition;
        const dx = pp.x - wp.x;
        const dz = pp.z - wp.z;
        const r = this.collectRadius;
        return dx * dx + dz * dz <= r * r;
    }

    private _collect(): void {
        this._collected = true;
        CurrencyWallet.ensure().add(CurrencyType.GoldCoin, this.amount);
        AudioController.ensure().play(SoundEffect.CollectCoin);
        this.node.destroy();
    }

    private _resolvePlayer(): Node | null {
        if (this.playerNode?.isValid) {
            return this.playerNode;
        }
        this.playerNode = GameSceneRefs.protagonist;
        return this.playerNode;
    }
}
