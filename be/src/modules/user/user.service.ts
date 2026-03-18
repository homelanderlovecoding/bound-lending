import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../../commons/base-module';
import { TABLE_NAME } from '../../commons/constants';
import { UserEntity, EUserRole } from '../../database/entities';

@Injectable()
export class UserService extends BaseService<UserEntity> {
  constructor(
    @InjectModel(TABLE_NAME.USER)
    private readonly userModel: Model<UserEntity>,
  ) {
    super(userModel);
  }

  /**
   * Find user by address, or create a new borrower account.
   */
  async findOrCreateByAddress(address: string): Promise<UserEntity> {
    const existing = await this.findOne({ address });
    if (existing) return existing;

    return this.create({
      address,
      pubkey: '', // Will be set when user provides pubkey
      roles: [EUserRole.BORROWER],
      isWhitelistedLender: false,
    } as Partial<UserEntity>);
  }

  /**
   * Check if a user is a whitelisted lender.
   */
  async isWhitelistedLender(userId: string): Promise<boolean> {
    const user = await this.findByIdOrThrow(userId);
    return user.isWhitelistedLender;
  }

  /**
   * Whitelist a user as a lender.
   */
  async whitelistLender(userId: string): Promise<UserEntity> {
    const user = await this.findByIdAndUpdate(userId, {
      $set: { isWhitelistedLender: true },
      $addToSet: { roles: EUserRole.LENDER },
    });
    if (!user) {
      return this.findByIdOrThrow(userId);
    }
    return user;
  }
}
