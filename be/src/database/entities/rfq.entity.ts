import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BaseEntity } from '../../commons/base-module';

export enum ERfqStatus {
  OPEN = 'open',
  OFFERS_RECEIVED = 'offers_received',
  SELECTED = 'selected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum ERfqOfferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  WITHDRAWN = 'withdrawn',
}

@Schema({ _id: true, timestamps: true })
export class RfqOfferSubDoc {
  declare _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lender: Types.ObjectId;

  @Prop({ type: String, required: true })
  lenderPubkey: string;

  /** Annual percentage rate */
  @Prop({ type: Number, required: true })
  rateApr: number;

  @Prop({ type: String, enum: ERfqOfferStatus, default: ERfqOfferStatus.PENDING })
  status: ERfqOfferStatus;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

@Schema({ timestamps: true, collection: 'rfqs' })
export class RfqEntity extends BaseEntity {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  borrower: Types.ObjectId;

  /** BTC amount offered as collateral */
  @Prop({ type: Number, required: true })
  collateralBtc: number;

  /** Loan amount requested in USD */
  @Prop({ type: Number, required: true })
  amountUsd: number;

  /** Calculated: amountUsd / (collateralBtc * btcPrice) */
  @Prop({ type: Number })
  impliedLtv: number;

  /** Loan term in days */
  @Prop({ type: Number, required: true })
  termDays: number;

  @Prop({ type: String, enum: ERfqStatus, default: ERfqStatus.OPEN, index: true })
  status: ERfqStatus;

  @Prop({ type: [RfqOfferSubDoc], default: [] })
  offers: RfqOfferSubDoc[];

  @Prop({ type: Types.ObjectId })
  selectedOffer: Types.ObjectId;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;
}

export const RfqSchema = SchemaFactory.createForClass(RfqEntity);
