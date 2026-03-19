export interface IRadFiRuneBalance {
  rune: string;
  runeid: string;
  spacedRune: string;
  symbol: string;
  divisibility: number;
  amount: string;
}

export interface IRadFiWalletBalance {
  btcSatoshi: number;
  runes: IRadFiRuneBalance[];
}

export interface IRadFiUtxo {
  txid: string;
  vout: number;
  satoshi: number;
  amount: string;
  runes: IRadFiRuneBalance[];
  confirmations: number;
  isAvailable: boolean;
  isSpent: boolean;
  scriptPk: string;
}

export interface IRadFiBalanceResult {
  address: string;
  btcSatoshi: number;
  btcAmount: number;
  busdAmount: number;
  busdRaw: string;
  runeId: string;
}
