export interface IUnisatRuneBalance {
  runeId: string;
  rune: string;
  spacedRune: string;
  symbol: string;
  divisibility: number;
  amount: string;
}

export interface IUnisatBalanceResult {
  address: string;
  runeId: string;
  amount: number;
  amountRaw: string;
  divisibility: number;
}

export interface IUnisatUtxoRuneBalance {
  txid: string;
  vout: number;
  runeId: string;
  amount: string;
  divisibility: number;
}
