import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BaseEntity } from '../../commons/base-module';

export enum ELoanState {
  ORIGINATION_PENDING = 'origination_pending',
  ACTIVE = 'active',
  GRACE = 'grace',
  REPAID = 'repaid',
  LIQUIDATED = 'liquidated',
  DEFAULTED = 'defaulted',
  FORFEITED = 'forfeited',
  CANCELLED = 'cancelled',
}

@Schema({ _id: false })
export class LoanEscrowSubDoc {
  @Prop({ type: String, required: true })
  address: string;

  @Prop({ type: String, required: true })
  redeemScript: string;

  @Prop({ type: String, required: true })
  borrowerPubkey: string;

  @Prop({ type: String, required: true })
  lenderPubkey: string;

  @Prop({ type: String, required: true })
  boundPubkey: string;

  @Prop({ type: String })
  fundingTxid: string;

  @Prop({ type: Number })
  fundingVout: number;
}

@Schema({ _id: false })
export class LoanTermsSubDoc {
  @Prop({ type: Number, required: true })
  principalUsd: number;

  @Prop({ type: Number, required: true })
  originationFee: number;

  @Prop({ type: Number, required: true })
  totalDebt: number;

  @Prop({ type: Number, required: true })
  collateralBtc: number;

  @Prop({ type: Number, required: true })
  rateApr: number;

  @Prop({ type: Number, required: true })
  termDays: number;

  @Prop({ type: Number, default: 7 })
  graceDays: number;

  @Prop({ type: Date })
  originatedAt: Date;

  @Prop({ type: Date })
  termExpiresAt: Date;

  @Prop({ type: Date })
  graceExpiresAt: Date;

  /** Block height when loan was originated (funding confirmed) */
  @Prop({ type: Number })
  originationBlock: number;

  /**
   * Block height when term expires: originationBlock + (termDays * 144)
   * 144 blocks/day @ 10 min/block
   */
  @Prop({ type: Number })
  termExpiresBlock: number;

  /**
   * Block height when grace period expires: termExpiresBlock + (graceDays * 144)
   */
  @Prop({ type: Number })
  graceExpiresBlock: number;
}

@Schema({ _id: false })
export class LoanLiquidationSubDoc {
  /** Lender-signed liquidation PSBT (hex) */
  @Prop({ type: String })
  preSignedPsbt: string;

  @Prop({ type: Date })
  inDangerSince: Date;

  @Prop({ type: Number })
  lastLtv: number;

  @Prop({ type: Date })
  lastPriceCheck: Date;
}

@Schema({ _id: true, timestamps: false })
export class LoanTimelineSubDoc {
  @Prop({ type: String, required: true })
  event: string;

  @Prop({ type: String })
  txid: string;

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;

  @Prop({ type: Object })
  metadata: Record<string, unknown>;
}

@Schema({ _id: false })
export class LoanMetadataSubDoc {
  @Prop({ type: String })
  encoded: string;

  @Prop({ type: String })
  format: string;
}

@Schema({ timestamps: true, collection: 'loans' })
export class LoanEntity extends BaseEntity {
  @Prop({ type: Types.ObjectId, ref: 'Rfq', required: true })
  rfq: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  borrower: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  lender: Types.ObjectId;

  @Prop({ type: LoanEscrowSubDoc })
  escrow: LoanEscrowSubDoc;

  @Prop({ type: LoanTermsSubDoc })
  terms: LoanTermsSubDoc;

  @Prop({ type: String, enum: ELoanState, default: ELoanState.ORIGINATION_PENDING, index: true })
  state: ELoanState;

  @Prop({ type: LoanLiquidationSubDoc })
  liquidation: LoanLiquidationSubDoc;

  @Prop({ type: [LoanTimelineSubDoc], default: [] })
  timeline: LoanTimelineSubDoc[];

  @Prop({ type: LoanMetadataSubDoc })
  metadata: LoanMetadataSubDoc;

  @Prop({ type: Boolean, default: false, index: true })
  requiresManualReview: boolean;

  /** Tracks which parties have signed the origination PSBT */
  @Prop({ type: Object, default: { borrower: false, lender: false, bound: false } })
  signatures: { borrower: boolean; lender: boolean; bound: boolean };

  /** Unsigned origination PSBT (hex) */
  @Prop({ type: String })
  originationPsbt: string;

  /** PSBT signing state */
  @Prop({ type: Object, default: {} })
  psbt: {
    lenderSigned?: string;     // lender-signed PSBT hex
    borrowerSigned?: string;   // borrower-signed PSBT hex
    lenderInputCount?: number; // how many inputs belong to lender
    borrowerInputCount?: number; // how many inputs belong to borrower
  };
}

export const LoanSchema = SchemaFactory.createForClass(LoanEntity);

LoanSchema.index({ 'escrow.address': 1 }, { unique: true, sparse: true });
LoanSchema.index({ 'terms.termExpiresAt': 1 });
LoanSchema.index({ 'terms.graceExpiresAt': 1 });
