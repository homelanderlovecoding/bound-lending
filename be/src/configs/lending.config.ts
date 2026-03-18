import { registerAs } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { ILendingConfig } from '../commons/types';

export default registerAs(
  ENV_REGISTER.LENDING,
  (): ILendingConfig => ({
    originationFeePct: parseFloat(process.env.ORIGINATION_FEE_PCT || '0.2'),
    gracePeriodDays: parseInt(process.env.GRACE_PERIOD_DAYS || '7', 10),
    liquidationLtvPct: parseInt(process.env.LIQUIDATION_LTV_PCT || '95', 10),
    minLoanAmountUsd: parseInt(process.env.MIN_LOAN_AMOUNT_USD || '100', 10),
    minLoanTermDays: parseInt(process.env.MIN_LOAN_TERM_DAYS || '30', 10),
    maxLtvPct: parseInt(process.env.MAX_LTV_PCT || '80', 10),
    onChainConfirmationThreshold: parseInt(process.env.ON_CHAIN_CONFIRMATION_THRESHOLD || '3', 10),
    manualReviewBtcThreshold: parseFloat(process.env.MANUAL_REVIEW_BTC_THRESHOLD || '0.20'),
  }),
);
