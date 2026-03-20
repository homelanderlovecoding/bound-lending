export { ELoanState } from '../../database/entities/loan.entity';

/** Valid state transitions */
export const LOAN_STATE_TRANSITIONS: Record<string, string[]> = {
  origination_pending: ['active', 'cancelled'],
  active: ['repaid', 'liquidated', 'grace'],
  grace: ['repaid', 'liquidated', 'defaulted'],
  defaulted: ['forfeited'],
};

/** Terminal states — no further transitions allowed */
export const TERMINAL_STATES = ['repaid', 'liquidated', 'forfeited', 'cancelled'];

export interface ICreateLoanParams {
  rfqId: string;
  borrowerId: string;
  lenderId: string;
  borrowerPubkey: string;
  lenderPubkey: string;
  boundPubkey?: string;       // optional — resolved from config if not provided
  amountUsd: number;
  collateralBtc: number;
  rateApr: number;
  termDays: number;
  originationFeePct?: number; // optional — resolved from config if not provided
  btcPrice?: number;          // optional — used for LTV calculation
}
