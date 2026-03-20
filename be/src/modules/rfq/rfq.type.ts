export { ERfqStatus, ERfqOfferStatus } from '../../database/entities/rfq.entity';

export interface IRfqCreateParams {
  borrowerId: string;
  collateralBtc: number;
  amountUsd: number;
  termDays: number;
  btcPrice: number;
  walletBalanceBtc?: number; // borrower's current BTC balance for coverage check
}

export interface IRfqOfferParams {
  rfqId: string;
  lenderId: string;
  lenderPubkey: string;
  rateApr: number;
}
