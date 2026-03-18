import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BaseEntity } from '../../commons/base-module';

export enum EPriceLogType {
  ROUTINE = 'routine',
  INITIAL_BREACH = 'initial_breach',
  CONFIRMATION_RECHECK = 'confirmation_recheck',
}

export enum EPriceLogDecision {
  HEALTHY = 'healthy',
  IN_DANGER = 'in_danger',
  LIQUIDATE = 'liquidate',
  DEFERRED = 'deferred',
}

@Schema({ _id: false })
export class PriceFeedEntry {
  @Prop({ type: Number })
  price: number;

  @Prop({ type: Date })
  timestamp: Date;

  @Prop({ type: Boolean })
  isOk: boolean;
}

@Schema({ timestamps: true, collection: 'price_logs' })
export class PriceLogEntity extends BaseEntity {
  @Prop({ type: Types.ObjectId, ref: 'Loan', index: true })
  loanId: Types.ObjectId;

  @Prop({ type: String, enum: EPriceLogType, required: true, index: true })
  type: EPriceLogType;

  @Prop({ type: Object })
  feeds: Record<string, PriceFeedEntry>;

  @Prop({ type: Number })
  medianPrice: number;

  @Prop({ type: Number })
  responsiveFeeds: number;

  @Prop({ type: Number })
  maxDifferentialPct: number;

  @Prop({ type: Number })
  calculatedLtv: number;

  @Prop({ type: String, enum: EPriceLogDecision })
  decision: EPriceLogDecision;
}

export const PriceLogSchema = SchemaFactory.createForClass(PriceLogEntity);

PriceLogSchema.index({ loanId: 1, createdAt: -1 });
