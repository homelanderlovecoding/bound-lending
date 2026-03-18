import { Network } from 'bitcoinjs-lib';

export interface IMultisigResult {
  address: string;
  redeemScript: Buffer;
  redeemScriptHex: string;
}

export interface IMultisigParams {
  borrowerPubkey: string;
  lenderPubkey: string;
  boundPubkey: string;
  network?: Network;
}

export interface IUtxoInput {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey?: string;
}

export interface IOriginationPsbtParams {
  lenderBusdUtxos: IUtxoInput[];
  borrowerBtcUtxos: IUtxoInput[];
  loanAmountSats: number;
  originationFeeSats: number;
  borrowerAddress: string;
  boundAddress: string;
  multisigAddress: string;
  redeemScript: Buffer;
  network?: Network;
  metadata?: Buffer;
}

export interface IRepaymentPsbtParams {
  borrowerBusdUtxos: IUtxoInput[];
  multisigUtxo: IUtxoInput;
  borrowerBtcAddress: string;
  lenderBusdAddress: string;
  repaymentAmountSats: number;
  redeemScript: Buffer;
  network?: Network;
  metadata?: Buffer;
}

export interface ILiquidationPsbtParams {
  multisigUtxo: IUtxoInput;
  lenderBtcAddress: string;
  redeemScript: Buffer;
  network?: Network;
}

export interface IForfeiturePsbtParams {
  multisigUtxo: IUtxoInput;
  lenderBtcAddress: string;
  redeemScript: Buffer;
  network?: Network;
}
