import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { LoanService } from './loan.service';
import { MultisigService } from '../escrow/multisig.service';
import { PsbtService } from '../escrow/psbt.service';
import { SigningService } from '../escrow/signing.service';
import { MetadataService } from '../escrow/metadata.service';
import { ELoanState } from '../../database/entities';
import { EVENT, ENV_REGISTER } from '../../commons/constants';
import { ICreateLoanParams } from './loan.type';

const mockMultisigService = {
  createMultisigAddress: jest.fn().mockReturnValue({
    address: 'bcrt1qmultisig00000000000000000000000000000000',
    redeemScript: Buffer.from('deadbeef', 'hex'),
    redeemScriptHex: 'deadbeef',
  }),
};
const mockPsbtService = { buildOriginationPsbt: jest.fn(), buildRepaymentPsbt: jest.fn() };
const mockSigningService = { signAllInputs: jest.fn(), psbtToHex: jest.fn().mockReturnValue('psbt-hex') };
const mockMetadataService = { encodeMetadata: jest.fn().mockReturnValue(Buffer.from('meta')) };
const mockEventEmitter = { emit: jest.fn() };

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === ENV_REGISTER.LENDING) {
      return {
        liquidationLtvPct: 95,
        manualReviewBtcThreshold: 0.2,
        gracePeriodDays: 7,
        originationFeePct: 0.2,
        maxLtvPct: 80,
        minLoanAmountUsd: 100,
        minLoanTermDays: 30,
        onChainConfirmationThreshold: 6,
      };
    }
  }),
};

describe('LoanService', () => {
  let service: LoanService;

  const borrowerId = new Types.ObjectId().toString();
  const lenderId = new Types.ObjectId().toString();
  const rfqId = new Types.ObjectId().toString();
  const loanId = new Types.ObjectId().toString();

  const createParams: ICreateLoanParams = {
    rfqId,
    borrowerId,
    lenderId,
    borrowerPubkey: '02' + 'aa'.repeat(32),
    lenderPubkey: '02' + 'bb'.repeat(32),
    boundPubkey: '02' + 'cc'.repeat(32),
    amountUsd: 20000,
    collateralBtc: 0.5,
    rateApr: 5.5,
    termDays: 90,
    originationFeePct: 0.2,
  };

  const baseLoan = {
    _id: loanId,
    rfq: new Types.ObjectId(rfqId),
    borrower: new Types.ObjectId(borrowerId),
    lender: new Types.ObjectId(lenderId),
    state: ELoanState.ORIGINATION_PENDING,
    escrow: {
      address: 'bcrt1qmultisig00000000000000000000000000000000',
      redeemScript: 'deadbeef',
      borrowerPubkey: createParams.borrowerPubkey,
      lenderPubkey: createParams.lenderPubkey,
      boundPubkey: createParams.boundPubkey,
      fundingTxid: '',
      fundingVout: 0,
    },
    terms: {
      principalUsd: 20000,
      originationFee: 40,
      totalDebt: 20040,
      collateralBtc: 0.5,
      rateApr: 5.5,
      termDays: 90,
      graceDays: 7,
      originatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
    liquidation: {},
    timeline: [],
    requiresManualReview: false,
    signatures: { borrower: false, lender: false, bound: false },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoanService,
        { provide: MultisigService, useValue: mockMultisigService },
        { provide: PsbtService, useValue: mockPsbtService },
        { provide: SigningService, useValue: mockSigningService },
        { provide: MetadataService, useValue: mockMetadataService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideProvider(LoanService)
      .useFactory({
        factory: () => {
          const svc = new LoanService(
            {} as any,
            mockMultisigService as any,
            mockPsbtService as any,
            mockSigningService as any,
            mockMetadataService as any,
            mockEventEmitter as any,
            mockConfigService as any,
          );
          return svc;
        },
      })
      .compile();

    service = module.get<LoanService>(LoanService);
  });

  describe('createFromRfq', () => {
    beforeEach(() => {
      jest.spyOn(service, 'create').mockResolvedValue(baseLoan as any);
    });

    it('should create loan in ORIGINATION_PENDING state', async () => {
      await service.createFromRfq(createParams);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ state: ELoanState.ORIGINATION_PENDING }),
      );
    });

    it('should call multisigService.createMultisigAddress and store result in escrow', async () => {
      await service.createFromRfq(createParams);
      expect(mockMultisigService.createMultisigAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          borrowerPubkey: createParams.borrowerPubkey,
          lenderPubkey: createParams.lenderPubkey,
          boundPubkey: createParams.boundPubkey,
        }),
      );
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          escrow: expect.objectContaining({
            address: 'bcrt1qmultisig00000000000000000000000000000000',
          }),
        }),
      );
    });

    it('should calculate origination fee and total debt correctly', async () => {
      await service.createFromRfq(createParams);
      const callArg = (service.create as jest.Mock).mock.calls[0][0];
      const expectedFee = createParams.amountUsd * (createParams.originationFeePct / 100);
      const expectedTotalDebt = createParams.amountUsd + expectedFee;
      expect(callArg.terms.originationFee).toBeCloseTo(expectedFee, 2);
      expect(callArg.terms.totalDebt).toBeCloseTo(expectedTotalDebt, 2);
    });

    it('should set requiresManualReview = true if collateral >= 0.20 BTC', async () => {
      jest.spyOn(service, 'create').mockResolvedValue({ ...baseLoan, requiresManualReview: true } as any);
      await service.createFromRfq({ ...createParams, collateralBtc: 0.25 });
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ requiresManualReview: true }),
      );
    });

    it('should emit LOAN_ORIGINATION_READY event', async () => {
      await service.createFromRfq(createParams);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.LOAN_ORIGINATION_READY,
        expect.objectContaining({ loanId: loanId }),
      );
    });
  });

  describe('transitionState', () => {
    beforeEach(() => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue(baseLoan as any);
      jest.spyOn(service, 'findByIdAndUpdate').mockResolvedValue({
        ...baseLoan,
        state: ELoanState.ACTIVE,
      } as any);
    });

    it('should transition ORIGINATION_PENDING → ACTIVE', async () => {
      await service.transitionState(loanId, ELoanState.ACTIVE);
      expect(service.findByIdAndUpdate).toHaveBeenCalledWith(
        loanId,
        expect.objectContaining({ $set: { state: ELoanState.ACTIVE } }),
      );
    });

    it('should transition ACTIVE → GRACE', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({ ...baseLoan, state: ELoanState.ACTIVE } as any);
      await service.transitionState(loanId, ELoanState.GRACE);
      expect(service.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should transition ACTIVE → REPAID', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({ ...baseLoan, state: ELoanState.ACTIVE } as any);
      await service.transitionState(loanId, ELoanState.REPAID);
      expect(service.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should transition ACTIVE → LIQUIDATED', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({ ...baseLoan, state: ELoanState.ACTIVE } as any);
      await service.transitionState(loanId, ELoanState.LIQUIDATED);
      expect(service.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should transition GRACE → DEFAULTED', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({ ...baseLoan, state: ELoanState.GRACE } as any);
      await service.transitionState(loanId, ELoanState.DEFAULTED);
      expect(service.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should transition DEFAULTED → FORFEITED', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({ ...baseLoan, state: ELoanState.DEFAULTED } as any);
      await service.transitionState(loanId, ELoanState.FORFEITED);
      expect(service.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should reject invalid transition ACTIVE → FORFEITED', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({ ...baseLoan, state: ELoanState.ACTIVE } as any);
      await expect(service.transitionState(loanId, ELoanState.FORFEITED)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject transition from terminal state REPAID → anything', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({ ...baseLoan, state: ELoanState.REPAID } as any);
      await expect(service.transitionState(loanId, ELoanState.ACTIVE)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should append to timeline ($push)', async () => {
      await service.transitionState(loanId, ELoanState.ACTIVE);
      expect(service.findByIdAndUpdate).toHaveBeenCalledWith(
        loanId,
        expect.objectContaining({
          $push: expect.objectContaining({ timeline: expect.anything() }),
        }),
      );
    });

    it('should emit LOAN_ACTIVATED event on ACTIVE transition', async () => {
      await service.transitionState(loanId, ELoanState.ACTIVE);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.LOAN_ACTIVATED,
        expect.objectContaining({ loanId }),
      );
    });
  });

  describe('recordSignature', () => {
    beforeEach(() => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue(baseLoan as any);
      jest.spyOn(service, 'findByIdAndUpdate').mockResolvedValue({
        ...baseLoan,
        signatures: { borrower: true, lender: false, bound: false },
      } as any);
    });

    it('should mark borrower as signed', async () => {
      await service.recordSignature(loanId, 'borrower', 'psbt-hex');
      expect(service.findByIdAndUpdate).toHaveBeenCalledWith(
        loanId,
        expect.objectContaining({ $set: { 'signatures.borrower': true } }),
      );
    });

    it('should reject if loan is not in ORIGINATION_PENDING state', async () => {
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue({
        ...baseLoan,
        state: ELoanState.ACTIVE,
      } as any);
      await expect(service.recordSignature(loanId, 'borrower', 'psbt-hex')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should emit LOAN_ORIGINATION_SIGNED event', async () => {
      await service.recordSignature(loanId, 'borrower', 'psbt-hex');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.LOAN_ORIGINATION_SIGNED,
        expect.objectContaining({ loanId, party: 'borrower' }),
      );
    });
  });

  describe('calculateRepaymentAmount', () => {
    it('should return correct accrued interest for N days outstanding', () => {
      const daysOutstanding = 30;
      const loan = {
        ...baseLoan,
        terms: {
          ...baseLoan.terms,
          totalDebt: 20000,
          rateApr: 12, // 12% APR = 1%/month
          originatedAt: new Date(Date.now() - daysOutstanding * 24 * 60 * 60 * 1000),
        },
      };

      const result = service.calculateRepaymentAmount(loan as any);
      const dailyRate = 12 / 100 / 365;
      const expectedInterest = 20000 * dailyRate * daysOutstanding;

      expect(result.daysOutstanding).toBe(daysOutstanding);
      expect(result.principalUsd).toBe(20000);
      expect(result.accruedInterest).toBeCloseTo(expectedInterest, 0);
      expect(result.totalRepay).toBeCloseTo(20000 + expectedInterest, 0);
    });
  });
});
