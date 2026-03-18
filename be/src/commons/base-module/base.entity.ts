import { Prop, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class BaseEntity<T = unknown> extends Document {
  declare _id: Types.ObjectId;

  @Prop({ type: Date })
  declare createdAt: Date;

  @Prop({ type: Date })
  declare updatedAt: Date;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}
