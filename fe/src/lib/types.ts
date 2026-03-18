export interface LoanOffer {
  _id: string;
  lender: string;
  lenderPubkey: string;
  rateApr: number;
  status: 'pending' | 'accepted' | 'withdrawn';
  createdAt: string;
}

export interface Rfq {
  _id: string;
  borrower: string;
  collateralBtc: number;
  amountUsd: number;
  impliedLtv: number;
  termDays: number;
  status: 'open' | 'offers_received' | 'selected' | 'cancelled' | 'expired';
  offers: LoanOffer[];
  selectedOffer?: string;
  expiresAt: string;
}

export interface LoanTerms {
  principalUsd: number;
  originationFee: number;
  totalDebt: number;
  collateralBtc: number;
  rateApr: number;
  termDays: number;
  graceDays: number;
  originatedAt?: string;
  termExpiresAt?: string;
  graceExpiresAt?: string;
}

export interface LoanEscrow {
  address: string;
  redeemScript: string;
  borrowerPubkey: string;
  lenderPubkey: string;
  boundPubkey: string;
  fundingTxid?: string;
  fundingVout?: number;
}

export interface Loan {
  _id: string;
  rfq: string;
  borrower: string;
  lender: string;
  escrow: LoanEscrow;
  terms: LoanTerms;
  state: LoanState;
  liquidation: {
    preSignedPsbt?: string;
    inDangerSince?: string;
    lastLtv?: number;
    lastPriceCheck?: string;
  };
  timeline: Array<{
    event: string;
    txid?: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }>;
  requiresManualReview: boolean;
  signatures: { borrower: boolean; lender: boolean; bound: boolean };
}

export type LoanState =
  | 'origination_pending'
  | 'active'
  | 'grace'
  | 'repaid'
  | 'liquidated'
  | 'defaulted'
  | 'forfeited'
  | 'cancelled';

export interface LendingConfig {
  originationFeePct: number;
  gracePeriodDays: number;
  liquidationLtvPct: number;
  minLoanAmountUsd: number;
  minLoanTermDays: number;
  maxLtvPct: number;
  onChainConfirmationThreshold: number;
  manualReviewBtcThreshold: number;
}

export interface RepaymentQuote {
  principalUsd: number;
  accruedInterest: number;
  totalRepay: number;
  daysOutstanding: number;
}

export interface DashboardSummary {
  activeLoanCount: number;
  totalBorrowed: number;
  totalLent: number;
  atRiskLoans: number;
}
