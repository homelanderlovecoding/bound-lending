import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseEntity } from '../../commons/base-module';

export enum EUserRole {
  BORROWER = 'borrower',
  LENDER = 'lender',
}

@Schema({ timestamps: true, collection: 'users' })
export class UserEntity extends BaseEntity {
  /** Bitcoin address (Trading Wallet) */
  @Prop({ type: String, required: true, unique: true, index: true })
  address: string;

  /** Compressed public key (hex) */
  @Prop({ type: String, required: true })
  pubkey: string;

  /** User roles */
  @Prop({ type: [String], enum: EUserRole, default: [EUserRole.BORROWER] })
  roles: EUserRole[];

  /** Bound Trading Wallet reference */
  @Prop({ type: String })
  tradingWalletId: string;

  /** Manual whitelist for lenders */
  @Prop({ type: Boolean, default: false })
  isWhitelistedLender: boolean;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
