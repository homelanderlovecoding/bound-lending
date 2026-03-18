import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BaseEntity } from '../../commons/base-module';

export enum EEventActor {
  BORROWER = 'borrower',
  LENDER = 'lender',
  BOUND = 'bound',
  SYSTEM = 'system',
}

@Schema({ timestamps: true, collection: 'events' })
export class EventEntity extends BaseEntity {
  @Prop({ type: Types.ObjectId, ref: 'Loan', required: true, index: true })
  loanId: Types.ObjectId;

  @Prop({ type: String, required: true })
  type: string;

  @Prop({ type: String, enum: EEventActor, required: true })
  actor: EEventActor;

  @Prop({ type: Object })
  data: Record<string, unknown>;
}

export const EventSchema = SchemaFactory.createForClass(EventEntity);

EventSchema.index({ loanId: 1, createdAt: -1 });
