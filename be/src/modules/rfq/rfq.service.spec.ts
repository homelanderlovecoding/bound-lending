import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { RfqService } from './rfq.service';
import { UserService } from '../user/user.service';
import { ERfqStatus, ERfqOfferStatus } from '../../database/entities';
import { EVENT, ENV_REGISTER } from '../../commons/constants';

const mockUserService = () => ({
  findOne: jest.fn(),
  findOneOrThrow: jest.fn(),
  findById: jest.fn(),
  findByIdOrThrow: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  paginate: jest.fn(),
  isWhitelistedLender: jest.fn(),
});

const mockEventEmitter = { emit: jest.fn() };

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === ENV_REGISTER.LENDING) {
      return {
        maxLtvPct: 80,
        liquidationLtvPct: 95,
        manualReviewBtcThreshold: 0.2,
        onChainConfirmationThreshold: 6,
        gracePeriodDays: 7,
        originationFeePct: 0.2,
        minLoanAmountUsd: 100,
        minLoanTermDays: 30,
      };
    }
  }),
};

describe('RfqService', () => {
  let service: RfqService;
  let userService: ReturnType<typeof mockUserService>;

  const borrowerId = new Types.ObjectId().toString();
  const lenderId = new Types.ObjectId().toString();
  const rfqId = new Types.ObjectId().toString();
  const offerId = new Types.ObjectId().toString();

  const baseRfq = {
    _id: rfqId,
    borrower: new Types.ObjectId(borrowerId),
    collateralBtc: 0.5,
    amountUsd: 20000,
    impliedLtv: 43.8,
    termDays: 90,
    status: ERfqStatus.OPEN,
    offers: [],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    userService = mockUserService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RfqService,
        { provide: UserService, useValue: userService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideProvider(RfqService)
      .useFactory({
        factory: () => {
          const svc = new RfqService({} as any, userService as any, mockEventEmitter as any, mockConfigService as any);
          return svc;
        },
      })
      .compile();

    service = module.get<RfqService>(RfqService);
  });

  describe('createRfq', () => {
    const createParams = {
      borrowerId,
      collateralBtc: 0.5,
      amountUsd: 20000,
      termDays: 90,
      btcPrice: 91000,
    };

    beforeEach(() => {
      jest.spyOn(service, 'create').mockResolvedValue(baseRfq as any);
    });

    it('should create RFQ with OPEN status', async () => {
      const result = await service.createRfq(createParams);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ERfqStatus.OPEN }),
      );
    });

    it('should calculate and store implied LTV', async () => {
      await service.createRfq(createParams);
      const callArg = (service.create as jest.Mock).mock.calls[0][0];
      const expectedLtv = (20000 / (0.5 * 91000)) * 100;
      expect(callArg.impliedLtv).toBeCloseTo(expectedLtv, 1);
    });

    it('should reject if implied LTV > 80%', async () => {
      await expect(
        service.createRfq({ ...createParams, amountUsd: 50000, btcPrice: 60000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set 24h expiry', async () => {
      const before = Date.now();
      await service.createRfq(createParams);
      const callArg = (service.create as jest.Mock).mock.calls[0][0];
      const expiresAt = callArg.expiresAt as Date;
      const diff = expiresAt.getTime() - before;
      expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    });

    it('should emit RFQ_CREATED event', async () => {
      await service.createRfq(createParams);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.RFQ_CREATED,
        expect.objectContaining({ rfqId: rfqId }),
      );
    });
  });

  describe('submitOffer', () => {
    const offerParams = {
      rfqId,
      lenderId,
      lenderPubkey: '02' + 'ab'.repeat(32),
      rateApr: 5.5,
    };

    beforeEach(() => {
      userService.isWhitelistedLender.mockResolvedValue(true);
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue(baseRfq as any);
      jest.spyOn(service, 'findByIdAndUpdate').mockResolvedValue({
        ...baseRfq,
        status: ERfqStatus.OFFERS_RECEIVED,
        offers: [{ _id: new Types.ObjectId(offerId), lender: new Types.ObjectId(lenderId), rateApr: 5.5, status: ERfqOfferStatus.PENDING }],
      } as any);
    });

    it('should add offer to RFQ and set status to OFFERS_RECEIVED', async () => {
      const result = await service.submitOffer(offerParams);
      expect(service.findByIdAndUpdate).toHaveBeenCalledWith(
        rfqId,
        expect.objectContaining({
          $set: { status: ERfqStatus.OFFERS_RECEIVED },
        }),
      );
    });

    it('should emit RFQ_OFFER_RECEIVED event', async () => {
      await service.submitOffer(offerParams);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.RFQ_OFFER_RECEIVED,
        expect.objectContaining({ rfqId }),
      );
    });

    it('should reject non-whitelisted lender', async () => {
      userService.isWhitelistedLender.mockResolvedValue(false);
      await expect(service.submitOffer(offerParams)).rejects.toThrow(ForbiddenException);
    });

    it('should reject offer on expired RFQ', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({
        ...baseRfq,
        expiresAt: new Date(Date.now() - 1000),
      } as any);
      await expect(service.submitOffer(offerParams)).rejects.toThrow(BadRequestException);
    });

    it('should reject offer on already-accepted RFQ', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({
        ...baseRfq,
        status: ERfqStatus.SELECTED,
      } as any);
      await expect(service.submitOffer(offerParams)).rejects.toThrow(BadRequestException);
    });
  });

  describe('withdrawOffer', () => {
    const offerObjectId = new Types.ObjectId(offerId);
    const rfqWithOffer = {
      ...baseRfq,
      status: ERfqStatus.OFFERS_RECEIVED,
      offers: [{
        _id: offerObjectId,
        lender: new Types.ObjectId(lenderId),
        rateApr: 5.5,
        status: ERfqOfferStatus.PENDING,
      }],
    };

    it('should set offer status to WITHDRAWN and emit event', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue(rfqWithOffer as any);
      jest.spyOn(service, 'findOneAndUpdate').mockResolvedValue({
        ...rfqWithOffer,
        offers: [{ ...rfqWithOffer.offers[0], status: ERfqOfferStatus.WITHDRAWN }],
      } as any);

      await service.withdrawOffer(rfqId, offerId, lenderId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.RFQ_OFFER_WITHDRAWN,
        expect.objectContaining({ rfqId, offerId }),
      );
    });
  });

  describe('acceptOffer', () => {
    const offerObjectId = new Types.ObjectId(offerId);
    const rfqWithOffer = {
      ...baseRfq,
      status: ERfqStatus.OFFERS_RECEIVED,
      offers: [{
        _id: offerObjectId,
        lender: new Types.ObjectId(lenderId),
        rateApr: 5.5,
        status: ERfqOfferStatus.PENDING,
      }],
    };

    beforeEach(() => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue(rfqWithOffer as any);
      jest.spyOn(service, 'findByIdAndUpdate').mockResolvedValue({
        ...rfqWithOffer,
        status: ERfqStatus.SELECTED,
      } as any);
    });

    it('should set RFQ status to SELECTED and emit event', async () => {
      await service.acceptOffer(rfqId, offerId, borrowerId);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.RFQ_ACCEPTED,
        expect.objectContaining({ rfqId, offerId }),
      );
    });

    it('should reject if caller is not the borrower', async () => {
      const otherUserId = new Types.ObjectId().toString();
      await expect(service.acceptOffer(rfqId, offerId, otherUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('cancelRfq', () => {
    it('should cancel an open RFQ and emit event', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue(baseRfq as any);
      jest.spyOn(service, 'findByIdAndUpdate').mockResolvedValue({
        ...baseRfq,
        status: ERfqStatus.CANCELLED,
      } as any);

      await service.cancelRfq(rfqId, borrowerId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.RFQ_CANCELLED,
        expect.objectContaining({ rfqId }),
      );
    });

    it('should reject cancellation if RFQ is already selected', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({
        ...baseRfq,
        status: ERfqStatus.SELECTED,
      } as any);

      await expect(service.cancelRfq(rfqId, borrowerId)).rejects.toThrow(BadRequestException);
    });
  });
});
