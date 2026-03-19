import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { LiquidationService } from './liquidation.service';
import { LoanService } from '../loan/loan.service';
import { PriceFeedService } from '../price-feed/price-feed.service';
import { ELoanState } from '../../database/entities';
import { EVENT, ENV_REGISTER } from '../../commons/constants';

const mockLoanService = () => ({
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
  calculateRepaymentAmount: jest.fn(),
  transitionState: jest.fn(),
});

const mockPriceFeedService = () => ({
  getBtcPrice: jest.fn(),
  checkOracleDifferential: jest.fn(),
});

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
        onChainConfirmationThreshold: 6,
      };
    }
  }),
};

describe('LiquidationService', () => {
  let service: LiquidationService;
  let loanService: ReturnType<typeof mockLoanService>;
  let priceFeedService: ReturnType<typeof mockPriceFeedService>;

  const loanId = new Types.ObjectId().toString();

  const makeActiveLoan = (overrides: Record<string, unknown> = {}) => ({
    _id: loanId,
    state: ELoanState.ACTIVE,
    terms: {
      collateralBtc: 0.1, // < 0.2 BTC → auto-liquidate
      totalDebt: 8000,
      rateApr: 5,
      originatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    liquidation: {},
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    loanService = mockLoanService();
    priceFeedService = mockPriceFeedService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiquidationService,
        { provide: LoanService, useValue: loanService },
        { provide: PriceFeedService, useValue: priceFeedService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LiquidationService>(LiquidationService);
  });

  describe('scanAllLoans', () => {
    it('should skip scan and return [] if BTC price is unavailable (0)', async () => {
      priceFeedService.getBtcPrice.mockResolvedValue(0);
      const result = await service.scanAllLoans();
      expect(result).toEqual([]);
      expect(loanService.find).not.toHaveBeenCalled();
    });

    it('should return empty array if no active loans', async () => {
      priceFeedService.getBtcPrice.mockResolvedValue(91000);
      loanService.find.mockResolvedValue([]);
      const result = await service.scanAllLoans();
      expect(result).toEqual([]);
    });
  });

  describe('checkLoanLtv', () => {
    it('should return null if LTV < 95%', async () => {
      const loan = makeActiveLoan();
      // 0.1 BTC * 91000 = $9100 collateral, debt = $8000 → LTV ≈ 87.9% — under threshold
      loanService.findByIdAndUpdate.mockResolvedValue(loan);
      loanService.calculateRepaymentAmount.mockReturnValue({ totalRepay: 8000 });

      const result = await service.checkLoanLtv(loan as any, 91000);
      expect(result).toBeNull();
    });

    it('should flag IN_DANGER if LTV >= 95% and set inDangerSince', async () => {
      const loan = makeActiveLoan({ liquidation: {} }); // no inDangerSince yet
      // 0.1 BTC * 84000 = $8400 collateral, debt = $8000 → LTV ≈ 95.2%
      loanService.findByIdAndUpdate.mockResolvedValue(loan);
      loanService.calculateRepaymentAmount.mockReturnValue({ totalRepay: 8000 });

      await service.checkLoanLtv(loan as any, 84000);

      expect(loanService.findByIdAndUpdate).toHaveBeenCalledWith(
        loanId,
        expect.objectContaining({
          $set: expect.objectContaining({ 'liquidation.inDangerSince': expect.any(Date) }),
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.LOAN_IN_DANGER,
        expect.objectContaining({ loanId, currentLtv: expect.any(Number) }),
      );
    });

    it('should clear IN_DANGER flag if LTV recovers', async () => {
      const loan = makeActiveLoan({ liquidation: { inDangerSince: new Date() } });
      loanService.findByIdAndUpdate.mockResolvedValue(loan);
      loanService.calculateRepaymentAmount.mockReturnValue({ totalRepay: 8000 });

      // Price recovered — LTV back under 95%
      await service.checkLoanLtv(loan as any, 91000);

      expect(loanService.findByIdAndUpdate).toHaveBeenCalledWith(
        loanId,
        expect.objectContaining({
          $set: expect.objectContaining({ 'liquidation.inDangerSince': null }),
        }),
      );
    });
  });

  describe('executeOracleCheck', () => {
    it('should return true if differential <= 0.25%', async () => {
      priceFeedService.checkOracleDifferential.mockResolvedValue({
        isOk: true,
        maxDifferentialPct: 0.1,
        feeds: [],
      });
      const result = await service.executeOracleCheck(loanId);
      expect(result).toBe(true);
    });

    it('should return false if differential > 0.25%', async () => {
      priceFeedService.checkOracleDifferential.mockResolvedValue({
        isOk: false,
        maxDifferentialPct: 0.5,
        feeds: [],
      });
      const result = await service.executeOracleCheck(loanId);
      expect(result).toBe(false);
    });
  });

  describe('executeLiquidation', () => {
    const loan = makeActiveLoan();

    beforeEach(() => {
      loanService.findByIdOrThrow.mockResolvedValue(loan);
      loanService.calculateRepaymentAmount.mockReturnValue({ totalRepay: 8000 });
      loanService.transitionState.mockResolvedValue({ ...loan, state: ELoanState.LIQUIDATED });
    });

    it('should skip liquidation if oracle check fails', async () => {
      priceFeedService.checkOracleDifferential.mockResolvedValue({ isOk: false, maxDifferentialPct: 1.0, feeds: [] });
      priceFeedService.getBtcPrice.mockResolvedValue(84000);

      await service.executeLiquidation(loanId);
      expect(loanService.transitionState).not.toHaveBeenCalled();
    });

    it('should skip liquidation if LTV recovered after oracle check', async () => {
      priceFeedService.checkOracleDifferential.mockResolvedValue({ isOk: true, maxDifferentialPct: 0.1, feeds: [] });
      // getBtcPrice is called once inside executeLiquidation for the re-check
      // Return a high price so LTV is recovered: 0.1 BTC * 96000 = $9600, debt $8000 → LTV 83%
      priceFeedService.getBtcPrice.mockResolvedValue(96000);

      await service.executeLiquidation(loanId);
      expect(loanService.transitionState).not.toHaveBeenCalled();
    });

    it('should emit REVIEW_REQUIRED and skip auto-liquidation if collateral >= 0.20 BTC', async () => {
      const bigLoan = makeActiveLoan({ terms: { collateralBtc: 0.25, totalDebt: 20000, rateApr: 5, originatedAt: new Date() } });
      loanService.findByIdOrThrow.mockResolvedValue(bigLoan);
      loanService.calculateRepaymentAmount.mockReturnValue({ totalRepay: 20000 });
      priceFeedService.checkOracleDifferential.mockResolvedValue({ isOk: true, maxDifferentialPct: 0.1, feeds: [] });
      priceFeedService.getBtcPrice.mockResolvedValue(84000); // 0.25 * 84000 = 21000 → LTV = 95.2%

      await service.executeLiquidation(loanId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENT.REVIEW_REQUIRED,
        expect.objectContaining({ loanId: expect.any(String) }),
      );
      expect(loanService.transitionState).not.toHaveBeenCalled();
    });

    it('should transition to LIQUIDATED for auto-liquidation (oracle OK, LTV breached, collateral < 0.20 BTC)', async () => {
      priceFeedService.checkOracleDifferential.mockResolvedValue({ isOk: true, maxDifferentialPct: 0.1, feeds: [] });
      priceFeedService.getBtcPrice.mockResolvedValue(84000); // 0.1 * 84000 = 8400 → LTV ≈ 95.2%

      await service.executeLiquidation(loanId);

      expect(loanService.transitionState).toHaveBeenCalledWith(
        loanId,
        ELoanState.LIQUIDATED,
        expect.any(Object),
      );
    });
  });
});
