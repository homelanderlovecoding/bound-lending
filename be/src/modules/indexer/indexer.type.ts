export enum EIndexerEventType {
  FUNDING_DETECTED = 'funding_detected',
  FUNDING_CONFIRMED = 'funding_confirmed',
  REPAYMENT_DETECTED = 'repayment_detected',
  REPAYMENT_CONFIRMED = 'repayment_confirmed',
  REORG_DETECTED = 'reorg_detected',
}

export interface IUtxoStatus {
  txid: string;
  vout: number;
  value: number;
  confirmations: number;
  isConfirmed: boolean;
}

export interface IWatchedAddress {
  address: string;
  loanId: string;
  type: 'escrow' | 'repayment';
}
