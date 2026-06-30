import {
    _decorator,
    Component,
    director,
    Label,
    Node,
} from 'cc';
import { CurrencyBalanceListener, CurrencyWallet } from './CurrencyWallet';
import { CurrencyType } from './CurrencyType';

const { ccclass, property } = _decorator;

/**
 * 将场景 UI Label 绑定到钱包余额（自动查找 mainCanvas/coin/coinCount）。
 */
@ccclass('CurrencyDisplay')
export class CurrencyDisplay extends Component {
    @property({ type: Label, tooltip: '普通金币数量 Label，不填则查找 coin/coinCount' })
    goldCoinLabel: Label | null = null;

    @property({ type: Label, tooltip: '菠萝汁数量 Label（可选）' })
    pineappleJuiceLabel: Label | null = null;

    private _wallet: CurrencyWallet | null = null;
    private readonly _onBalanceChanged: CurrencyBalanceListener = (type, balance) => {
        this._refreshLabel(type, balance);
    };

    onLoad() {
        this._resolveLabels();
        this._wallet = CurrencyWallet.ensure();
        this._wallet.onBalanceChanged(this._onBalanceChanged);
        this._refreshAll();
    }

    onDestroy() {
        this._wallet?.offBalanceChanged(this._onBalanceChanged);
    }

    private _resolveLabels(): void {
        if (!this.goldCoinLabel) {
            this.goldCoinLabel = this._findLabel(['mainCanvas', 'coin', 'coinCount']);
        }
        if (!this.pineappleJuiceLabel) {
            this.pineappleJuiceLabel = this._findLabel(['mainCanvas', 'juice', 'juiceCount']);
        }
    }

    private _findLabel(path: string[]): Label | null {
        let node: Node | null = director.getScene();
        for (const name of path) {
            node = node?.getChildByName(name) ?? null;
            if (!node) {
                return null;
            }
        }
        return node?.getComponent(Label) ?? null;
    }

    private _refreshAll(): void {
        if (!this._wallet) {
            return;
        }
        this._refreshLabel(CurrencyType.GoldCoin, this._wallet.getBalance(CurrencyType.GoldCoin));
        this._refreshLabel(CurrencyType.PineappleJuice, this._wallet.getBalance(CurrencyType.PineappleJuice));
    }

    private _refreshLabel(type: CurrencyType, balance: number): void {
        const label = type === CurrencyType.GoldCoin
            ? this.goldCoinLabel
            : this.pineappleJuiceLabel;
        if (label) {
            label.string = String(balance);
        }
    }
}
