import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { BaseService } from '../../commons/base-module';
import { TABLE_NAME, EVENT, RESPONSE_CODE, ENV_REGISTER } from '../../commons/constants';
import { ILendingConfig } from '../../commons/types';
import { LoanEntity, ELoanState } from '../../database/entities';
import { MultisigService, PsbtService, SigningService, MetadataService } from '../escrow';
import { LOAN_STATE_TRANSITIONS, TERMINAL_STATES, ICreateLoanParams } from './loan.type';

@Injectable()
export class LoanService extends BaseService<LoanEntity> {
  private readonly lendingConfig: ILendingConfig;

  constructor(
    @InjectModel(TABLE_NAME.LOAN)
    private readonly loanModel: Model<LoanEntity>,
    private readonly multisigService: MultisigService,
    private readonly psbtService: PsbtService,
    private readonly signingService: SigningService,
    private readonly metadataService: MetadataService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    super(loanModel);
    this.lendingConfig = this.configService.get<ILendingConfig>(ENV_REGISTER.LENDING)!;
  }

  /**
   * Create a loan from an accepted RFQ offer.
   * Builds the escrow address + origination PSBT.
   */
  async createFromRfq(params: ICreateLoanParams): Promise<LoanEntity> {
    const escrow = this.buildEscrow(params);
    const terms = this.buildTerms(params);

    const loan = await this.create({
      rfq: new Types.ObjectId(params.rfqId),
      borrower: new Types.ObjectId(params.borrowerId),
      lender: new Types.ObjectId(params.lenderId),
      escrow,
      terms,
      state: ELoanState.ORIGINATION_PENDING,
      liquidation: {},
      timeline: [{ event: 'origination_pending', timestamp: new Date(), metadata: {} }],
      requiresManualReview: params.collateralBtc >= this.lendingConfig.manualReviewBtcThreshold,
      signatures: { borrower: false, lender: false, bound: false },
    } as Partial<LoanEntity>);

    this.eventEmitter.emit(EVENT.LOAN_ORIGINATION_READY, { loanId: loan._id.toString() });
    return loan;
  }

  /**
   * Transition loan to a new state (validates state machine).
   */
  async transitionState(loanId: string, newState: ELoanState, metadata?: Record<string, unknown>): Promise<LoanEntity> {
    const loan = await this.findByIdOrThrow(loanId);
    this.validateStateTransition(loan.state, newState);

    const updated = await this.findByIdAndUpdate(loanId, {
      $set: { state: newState },
      $push: {
        timeline: { event: newState, timestamp: new Date(), metadata: metadata ?? {} },
      },
    });

    this.emitStateEvent(newState, loanId, metadata);
    return updated!;
  }

  /**
   * Record a party's signature on the origination PSBT.
   */
  async recordSignature(
    loanId: string,
    party: 'borrower' | 'lender' | 'bound',
    signedPsbtHex: string,
  ): Promise<LoanEntity> {
    const loan = await this.findByIdOrThrow(loanId);
    this.validateLoanState(loan, ELoanState.ORIGINATION_PENDING);

    const updated = await this.findByIdAndUpdate(loanId, {
      $set: { [`signatures.${party}`]: true },
    });

    this.eventEmitter.emit(EVENT.LOAN_ORIGINATION_SIGNED, { loanId, party });
    return updated!;
  }

  /**
   * Get loans for a specific user (borrower or lender).
   */
  async getLoansByUser(userId: string, role?: string): Promise<LoanEntity[]> {
    const filter = role === 'lender'
      ? { lender: new Types.ObjectId(userId) }
      : { borrower: new Types.ObjectId(userId) };

    return this.find(filter);
  }

  /**
   * Calculate current repayment amount for a loan.
   */
  calculateRepaymentAmount(loan: LoanEntity): {
    principalUsd: number;
    accruedInterest: number;
    totalRepay: number;
    daysOutstanding: number;
  } {
    const now = new Date();
    const originatedAt = loan.terms.originatedAt ?? now;
    const daysOutstanding = Math.max(1, Math.ceil(
      (now.getTime() - originatedAt.getTime()) / (1000 * 60 * 60 * 24),
    ));

    const dailyRate = loan.terms.rateApr / 100 / 365;
    const accruedInterest = loan.terms.totalDebt * dailyRate * daysOutstanding;
    const totalRepay = loan.terms.totalDebt + accruedInterest;

    return {
      principalUsd: loan.terms.totalDebt,
      accruedInterest: Math.round(accruedInterest * 100) / 100,
      totalRepay: Math.round(totalRepay * 100) / 100,
      daysOutstanding,
    };
  }

  private buildEscrow(params: ICreateLoanParams) {
    const multisig = this.multisigService.createMultisigAddress({
      borrowerPubkey: params.borrowerPubkey,
      lenderPubkey: params.lenderPubkey,
      boundPubkey: params.boundPubkey,
    });

    return {
      address: multisig.address,
      redeemScript: multisig.redeemScriptHex,
      borrowerPubkey: params.borrowerPubkey,
      lenderPubkey: params.lenderPubkey,
      boundPubkey: params.boundPubkey,
      fundingTxid: '',
      fundingVout: 0,
    };
  }

  private buildTerms(params: ICreateLoanParams) {
    const originationFee = params.amountUsd * (params.originationFeePct / 100);
    const totalDebt = params.amountUsd + originationFee;

    return {
      principalUsd: params.amountUsd,
      originationFee,
      totalDebt,
      collateralBtc: params.collateralBtc,
      rateApr: params.rateApr,
      termDays: params.termDays,
      graceDays: this.lendingConfig.gracePeriodDays,
    };
  }

  private validateStateTransition(currentState: string, newState: string): void {
    if (TERMINAL_STATES.includes(currentState)) {
      throw new BadRequestException(RESPONSE_CODE.loan.invalidState);
    }

    const validNextStates = LOAN_STATE_TRANSITIONS[currentState] ?? [];
    if (!validNextStates.includes(newState)) {
      throw new BadRequestException(RESPONSE_CODE.loan.invalidState);
    }
  }

  private validateLoanState(loan: LoanEntity, expectedState: ELoanState): void {
    if (loan.state !== expectedState) {
      throw new BadRequestException(RESPONSE_CODE.loan.invalidState);
    }
  }

  private emitStateEvent(state: ELoanState, loanId: string, metadata?: Record<string, unknown>): void {
    const eventMap: Partial<Record<ELoanState, string>> = {
      [ELoanState.ACTIVE]: EVENT.LOAN_ACTIVATED,
      [ELoanState.REPAID]: EVENT.LOAN_REPAID,
      [ELoanState.LIQUIDATED]: EVENT.LOAN_LIQUIDATED,
      [ELoanState.GRACE]: EVENT.LOAN_GRACE_STARTED,
      [ELoanState.DEFAULTED]: EVENT.LOAN_DEFAULTED,
      [ELoanState.FORFEITED]: EVENT.LOAN_FORFEITED,
    };

    const eventName = eventMap[state];
    if (eventName) {
      this.eventEmitter.emit(eventName, { loanId, ...metadata });
    }
  }
}
