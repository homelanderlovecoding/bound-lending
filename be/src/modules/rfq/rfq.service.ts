import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { BaseService } from '../../commons/base-module';
import { TABLE_NAME, EVENT, RESPONSE_CODE, ENV_REGISTER } from '../../commons/constants';
import { ILendingConfig } from '../../commons/types';
import { RfqEntity, ERfqStatus, ERfqOfferStatus } from '../../database/entities';
import { UserService } from '../user/user.service';
import { IRfqCreateParams, IRfqOfferParams } from './rfq.type';

@Injectable()
export class RfqService extends BaseService<RfqEntity> {
  private readonly lendingConfig: ILendingConfig;

  constructor(
    @InjectModel(TABLE_NAME.RFQ)
    private readonly rfqModel: Model<RfqEntity>,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    super(rfqModel);
    this.lendingConfig = this.configService.get<ILendingConfig>(ENV_REGISTER.LENDING)!;
  }

  /**
   * Get borrower's own RFQs (active ones).
   */
  async getMyRfqs(borrowerId: string): Promise<RfqEntity[]> {
    return this.find({
      borrower: new Types.ObjectId(borrowerId),
      status: { $in: [ERfqStatus.OPEN, ERfqStatus.OFFERS_RECEIVED, ERfqStatus.SELECTED] },
    });
  }

  /**
   * Create a new RFQ with collateral coverage validation.
   * If walletBalanceBtc provided:
   *   - sum existing open RFQ collateral
   *   - if sum + new > balance → auto-cancel newest RFQs (oldest first) until it fits
   *   - if still can't fit → throw
   */
  async createRfq(params: IRfqCreateParams): Promise<RfqEntity> {
    this.validateLtv(params.amountUsd, params.collateralBtc, params.btcPrice);

    if (params.walletBalanceBtc !== undefined) {
      await this.enforceCollateralCoverage(
        params.borrowerId,
        params.collateralBtc,
        params.walletBalanceBtc,
      );
    }

    const impliedLtv = this.calculateLtv(params.amountUsd, params.collateralBtc, params.btcPrice);

    const rfq = await this.create({
      borrower: new Types.ObjectId(params.borrowerId),
      collateralBtc: params.collateralBtc,
      amountUsd: params.amountUsd,
      impliedLtv,
      termDays: params.termDays,
      status: ERfqStatus.OPEN,
      offers: [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h default
    } as Partial<RfqEntity>);

    this.eventEmitter.emit(EVENT.RFQ_CREATED, { rfqId: rfq._id.toString() });
    return rfq;
  }

  /**
   * Check and enforce collateral coverage:
   * Cancel newest open RFQs if total collateral exceeds wallet balance.
   */
  private async enforceCollateralCoverage(
    borrowerId: string,
    newCollateralBtc: number,
    walletBalanceBtc: number,
  ): Promise<void> {
    const openRfqs = await this.find({
      borrower: new Types.ObjectId(borrowerId),
      status: { $in: [ERfqStatus.OPEN, ERfqStatus.OFFERS_RECEIVED] },
    });

    // Sort oldest first (cancel newest if needed)
    openRfqs.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

    const usedBtc = openRfqs.reduce((sum, r) => sum + r.collateralBtc, 0);
    let available = walletBalanceBtc - usedBtc;

    if (available >= newCollateralBtc) return; // enough room, proceed

    // Auto-cancel newest RFQs (from end) until we have room
    const toCancel = [...openRfqs].reverse();
    for (const rfq of toCancel) {
      await this.findByIdAndUpdate(rfq._id.toString(), {
        $set: { status: ERfqStatus.CANCELLED },
      });
      this.eventEmitter.emit(EVENT.RFQ_CANCELLED, { rfqId: rfq._id.toString(), reason: 'insufficient_balance' });
      available += rfq.collateralBtc;
      if (available >= newCollateralBtc) return;
    }

    // Still not enough
    throw new BadRequestException(
      `Insufficient BTC balance. Need ${newCollateralBtc} BTC but only ${available.toFixed(6)} available after cancellations.`
    );
  }

  /**
   * Get all open RFQs (lender discovery feed).
   */
  async getOpenRfqs(): Promise<RfqEntity[]> {
    return this.find({
      status: { $in: [ERfqStatus.OPEN, ERfqStatus.OFFERS_RECEIVED] },
      expiresAt: { $gt: new Date() },
    });
  }

  /**
   * Submit an offer to an RFQ (lender responds with rate).
   */
  async submitOffer(params: IRfqOfferParams): Promise<RfqEntity> {
    // MVP: auto-whitelist any connected lender
    // TODO: add proper KYC/whitelist flow post-MVP
    const rfq = await this.findByIdOrThrow(params.rfqId);
    this.validateRfqAcceptsOffers(rfq);

    const offer = {
      _id: new Types.ObjectId(),
      lender: new Types.ObjectId(params.lenderId),
      lenderPubkey: params.lenderPubkey,
      rateApr: params.rateApr,
      status: ERfqOfferStatus.PENDING,
      createdAt: new Date(),
    };

    const updated = await this.findByIdAndUpdate(params.rfqId, {
      $push: { offers: offer },
      $set: { status: ERfqStatus.OFFERS_RECEIVED },
    });

    this.eventEmitter.emit(EVENT.RFQ_OFFER_RECEIVED, {
      rfqId: params.rfqId,
      offerId: offer._id.toString(),
    });

    return updated!;
  }

  /**
   * Withdraw an offer (lender pulls back).
   */
  async withdrawOffer(rfqId: string, offerId: string, lenderId: string): Promise<RfqEntity> {
    const rfq = await this.findByIdOrThrow(rfqId);
    this.validateOfferBelongsToLender(rfq, offerId, lenderId);

    const updated = await this.findOneAndUpdate(
      { _id: rfqId, 'offers._id': offerId },
      { $set: { 'offers.$.status': ERfqOfferStatus.WITHDRAWN } },
    );

    this.eventEmitter.emit(EVENT.RFQ_OFFER_WITHDRAWN, { rfqId, offerId });
    return updated!;
  }

  /**
   * Accept an offer (borrower picks a lender).
   */
  async acceptOffer(rfqId: string, offerId: string, borrowerId: string): Promise<RfqEntity> {
    const rfq = await this.findByIdOrThrow(rfqId);
    this.validateRfqBorrower(rfq, borrowerId);
    this.validateRfqAcceptsOffers(rfq);
    this.validateOfferExists(rfq, offerId);

    const updated = await this.findByIdAndUpdate(rfqId, {
      $set: {
        status: ERfqStatus.SELECTED,
        selectedOffer: new Types.ObjectId(offerId),
        'offers.$[elem].status': ERfqOfferStatus.ACCEPTED,
      },
    });

    this.eventEmitter.emit(EVENT.RFQ_ACCEPTED, { rfqId, offerId });
    return updated!;
  }

  /**
   * Cancel an RFQ (borrower cancels).
   */
  async cancelRfq(rfqId: string, borrowerId: string): Promise<RfqEntity> {
    const rfq = await this.findByIdOrThrow(rfqId);
    this.validateRfqBorrower(rfq, borrowerId);
    this.validateRfqCanBeCancelled(rfq);

    const updated = await this.findByIdAndUpdate(rfqId, {
      $set: { status: ERfqStatus.CANCELLED },
    });

    this.eventEmitter.emit(EVENT.RFQ_CANCELLED, { rfqId });
    return updated!;
  }

  private calculateLtv(amountUsd: number, collateralBtc: number, btcPrice: number): number {
    return (amountUsd / (collateralBtc * btcPrice)) * 100;
  }

  private validateLtv(amountUsd: number, collateralBtc: number, btcPrice: number): void {
    const ltv = this.calculateLtv(amountUsd, collateralBtc, btcPrice);
    if (ltv > this.lendingConfig.maxLtvPct) {
      throw new BadRequestException(RESPONSE_CODE.rfq.invalidLtv);
    }
  }

  private async validateLenderWhitelist(lenderId: string): Promise<void> {
    const isWhitelisted = await this.userService.isWhitelistedLender(lenderId);
    if (!isWhitelisted) {
      throw new ForbiddenException(RESPONSE_CODE.user.notWhitelistedLender);
    }
  }

  private validateRfqAcceptsOffers(rfq: RfqEntity): void {
    if (rfq.status !== ERfqStatus.OPEN && rfq.status !== ERfqStatus.OFFERS_RECEIVED) {
      throw new BadRequestException(RESPONSE_CODE.rfq.alreadyAccepted);
    }
    if (new Date() > rfq.expiresAt) {
      throw new BadRequestException(RESPONSE_CODE.rfq.expired);
    }
  }

  private validateRfqBorrower(rfq: RfqEntity, borrowerId: string): void {
    if (rfq.borrower.toString() !== borrowerId) {
      throw new ForbiddenException(RESPONSE_CODE.loan.notBorrower);
    }
  }

  private validateOfferExists(rfq: RfqEntity, offerId: string): void {
    const offer = rfq.offers.find((o) => o._id.toString() === offerId);
    if (!offer || offer.status !== ERfqOfferStatus.PENDING) {
      throw new BadRequestException(RESPONSE_CODE.rfq.offerNotFound);
    }
  }

  private validateOfferBelongsToLender(rfq: RfqEntity, offerId: string, lenderId: string): void {
    const offer = rfq.offers.find((o) => o._id.toString() === offerId);
    if (!offer || offer.lender.toString() !== lenderId) {
      throw new BadRequestException(RESPONSE_CODE.rfq.offerNotFound);
    }
  }

  private validateRfqCanBeCancelled(rfq: RfqEntity): void {
    if (rfq.status === ERfqStatus.SELECTED || rfq.status === ERfqStatus.CANCELLED) {
      throw new BadRequestException(RESPONSE_CODE.rfq.cannotCancel);
    }
  }
}
