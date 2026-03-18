export { ERfqStatus, ERfqOfferStatus } from '../../database/entities/rfq.entity';

export interface IRfqCreateParams {
  borrowerId: string;
  collateralBtc: number;
  amountUsd: number;
  termDays: number;
  btcPrice: number;
}

export interface IRfqOfferParams {
  rfqId: string;
  lenderId: string;
  lenderPubkey: string;
  rateApr: number;
}
