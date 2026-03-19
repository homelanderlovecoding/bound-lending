import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ENV_REGISTER, EVENT, RESPONSE_CODE } from '../../commons/constants';
import { ILendingConfig } from '../../commons/types';
import { LoanEntity, ELoanState } from '../../database/entities';
import { LoanService } from '../loan/loan.service';
import { LoanSigningService } from '../loan/loan-signing.service';
import { PriceFeedService } from '../price-feed/price-feed.service';
import { ELiquidationAction, ILtvCheckResult } from './liquidation.type';

@Injectable()
export class LiquidationService {
  private readonly logger = new Logger(LiquidationService.name);
  private readonly lendingConfig: ILendingConfig;

  constructor(
    private readonly loanService: LoanService,
    private readonly loanSigningService: LoanSigningService,
    private readonly priceFeedService: PriceFeedService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.lendingConfig = this.configService.get<ILendingConfig>(ENV_REGISTER.LENDING)!;
  }

  /**
   * Scan all active + grace loans for LTV breach.
   * Called by BullMQ on every price update.
   */
  async scanAllLoans(): Promise<ILtvCheckResult[]> {
    const btcPrice = await this.priceFeedService.getBtcPrice();
    if (btcPrice <= 0) {
      this.logger.warn('BTC price unavailable, skipping LTV scan');
      return [];
    }

    const activeLoans = await this.fetchLiquidatableLoans();
    const results: ILtvCheckResult[] = [];

    for (const loan of activeLoans) {
      const result = await this.checkLoanLtv(loan, btcPrice);
      if (result) results.push(result);
    }

    return results;
  }

  /**
   * Check a single loan's LTV and decide action.
   */
  async checkLoanLtv(loan: LoanEntity, btcPrice: number): Promise<ILtvCheckResult | null> {
    const { totalRepay } = this.loanService.calculateRepaymentAmount(loan);
    const collateralValueUsd = loan.terms.collateralBtc * btcPrice;
    const currentLtv = (totalRepay / collateralValueUsd) * 100;

    // Update loan's last LTV
    await this.updateLoanLtv(loan._id.toString(), currentLtv);

    if (currentLtv < this.lendingConfig.liquidationLtvPct) {
      return this.handleHealthyLoan(loan, currentLtv, btcPrice);
    }

    return this.handleBreachedLoan(loan, currentLtv, btcPrice, totalRepay, collateralValueUsd);
  }

  /**
   * Execute oracle differential check before liquidation.
   * Per spec: max diff between any two feeds ≤ 0.25%.
   */
  async executeOracleCheck(loanId: string): Promise<boolean> {
    const oracleResult = await this.priceFeedService.checkOracleDifferential();

    if (!oracleResult.isOk) {
      this.logger.warn(
        `Oracle differential too high (${oracleResult.maxDifferentialPct.toFixed(3)}%) for loan ${loanId}, deferring`,
      );
      return false;
    }

    return true;
  }

  /**
   * Execute liquidation: co-sign pre-signed PSBT + broadcast.
   */
  async executeLiquidation(loanId: string): Promise<void> {
    const loan = await this.loanService.findByIdOrThrow(loanId);
    this.validateLiquidatable(loan);

    const oracleOk = await this.executeOracleCheck(loanId);
    if (!oracleOk) return;

    // Re-check LTV after oracle check
    const btcPrice = await this.priceFeedService.getBtcPrice();
    const { totalRepay } = this.loanService.calculateRepaymentAmount(loan);
    const currentLtv = (totalRepay / (loan.terms.collateralBtc * btcPrice)) * 100;

    if (currentLtv < this.lendingConfig.liquidationLtvPct) {
      this.logger.log(`LTV recovered for loan ${loanId} (${currentLtv.toFixed(1)}%)`);
      return;
    }

    if (this.requiresManualReview(loan)) {
      this.emitManualReview(loanId, currentLtv, btcPrice);
      return;
    }

    await this.performLiquidation(loanId, currentLtv, btcPrice);
  }

  private async fetchLiquidatableLoans(): Promise<LoanEntity[]> {
    return this.loanService.find({
      state: { $in: [ELoanState.ACTIVE, ELoanState.GRACE] },
    });
  }

  private async updateLoanLtv(loanId: string, ltv: number): Promise<void> {
    await this.loanService.findByIdAndUpdate(loanId, {
      $set: {
        'liquidation.lastLtv': ltv,
        'liquidation.lastPriceCheck': new Date(),
      },
    });
  }

  private handleHealthyLoan(
    loan: LoanEntity,
    currentLtv: number,
    btcPrice: number,
  ): ILtvCheckResult | null {
    // Clear in-danger flag if it was set
    if (loan.liquidation?.inDangerSince) {
      this.loanService.findByIdAndUpdate(loan._id.toString(), {
        $set: { 'liquidation.inDangerSince': null },
      });
    }
    return null;
  }

  private async handleBreachedLoan(
    loan: LoanEntity,
    currentLtv: number,
    btcPrice: number,
    outstandingDebt: number,
    collateralValueUsd: number,
  ): Promise<ILtvCheckResult> {
    const loanId = loan._id.toString();

    // Flag as in-danger if not already
    if (!loan.liquidation?.inDangerSince) {
      await this.loanService.findByIdAndUpdate(loanId, {
        $set: { 'liquidation.inDangerSince': new Date() },
      });
      this.eventEmitter.emit(EVENT.LOAN_IN_DANGER, { loanId, currentLtv, btcPrice });
    }

    const action = this.determineAction(loan);

    return { loanId, currentLtv, btcPrice, outstandingDebt, collateralValueUsd, action };
  }

  private determineAction(loan: LoanEntity): ELiquidationAction {
    if (this.requiresManualReview(loan)) {
      return ELiquidationAction.MANUAL_REVIEW;
    }
    return ELiquidationAction.AUTO_LIQUIDATE;
  }

  private requiresManualReview(loan: LoanEntity): boolean {
    return loan.terms.collateralBtc >= this.lendingConfig.manualReviewBtcThreshold;
  }

  private validateLiquidatable(loan: LoanEntity): void {
    const validStates = [ELoanState.ACTIVE, ELoanState.GRACE];
    if (!validStates.includes(loan.state)) {
      this.logger.warn(`Loan ${loan._id} not liquidatable (state: ${loan.state})`);
    }
  }

  private emitManualReview(loanId: string, ltv: number, btcPrice: number): void {
    this.logger.warn(`Manual review required for loan ${loanId} (≥0.20 BTC)`);
    this.eventEmitter.emit(EVENT.REVIEW_REQUIRED, {
      loanId,
      reason: 'liquidation',
      ltv,
      btcPrice,
    });
  }

  private async performLiquidation(loanId: string, ltv: number, btcPrice: number): Promise<void> {
    this.logger.log(`Executing liquidation for loan ${loanId} (LTV: ${ltv.toFixed(1)}%)`);

    try {
      const txid = await this.loanSigningService.executeLiquidation(loanId);
      this.logger.log(`Liquidation executed for loan ${loanId}, txid: ${txid}`);
    } catch (err) {
      this.logger.error(`Liquidation execution failed for loan ${loanId}: ${err}`);
      // Emit for manual review on failure
      this.eventEmitter.emit(EVENT.REVIEW_REQUIRED, {
        loanId,
        reason: 'liquidation_failed',
        ltv,
        btcPrice,
        error: String(err),
      });
    }
  }
}
