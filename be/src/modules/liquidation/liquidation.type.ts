export enum ELiquidationAction {
  AUTO_LIQUIDATE = 'auto_liquidate',
  MANUAL_REVIEW = 'manual_review',
  DEFERRED = 'deferred',
  RECOVERED = 'recovered',
}

export interface ILtvCheckResult {
  loanId: string;
  currentLtv: number;
  btcPrice: number;
  outstandingDebt: number;
  collateralValueUsd: number;
  action: ELiquidationAction;
}
