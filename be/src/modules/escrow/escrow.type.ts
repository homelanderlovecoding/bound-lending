import { Network } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types';

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

/** Tapscript 2-of-3 multisig result */
export interface ITaprootMultisigResult {
  address: string;
  /** x-only pubkeys sorted */
  borrowerXOnly: Buffer;
  lenderXOnly: Buffer;
  boundXOnly: Buffer;
  /** Script leaves */
  leafBorrowerLender: Buffer;
  leafBorrowerBound: Buffer;
  leafLenderBound: Buffer;
  scriptTree: Taptree;
  network: Network;
}

export interface ITaprootMultisigParams {
  borrowerPubkey: string;  // 33-byte compressed hex
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
  // P2WSH params (legacy)
  redeemScript?: Buffer;
  // P2TR params
  taprootMultisig?: ITaprootMultisigResult;
  network?: Network;
  metadata?: Buffer;
}

export interface ITaprootPsbtParams {
  multisigUtxo: IUtxoInput;
  taprootMultisig: ITaprootMultisigResult;
  /** Which leaf to spend: 'borrower_lender' | 'borrower_bound' | 'lender_bound' */
  spendLeaf: 'borrower_lender' | 'borrower_bound' | 'lender_bound';
  outputAddress: string;
  network?: Network;
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
