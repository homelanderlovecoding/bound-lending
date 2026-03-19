import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { IndexerService } from './indexer.service';
import { LoanService } from '../loan/loan.service';
import { UnisatService } from '../unisat/unisat.service';
import { ELoanState } from '../../database/entities';
import { ENV_REGISTER } from '../../commons/constants';

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
  transitionState: jest.fn(),
});

const mockEventEmitter = { emit: jest.fn() };

const mockUnisatService = {
  getLatestBlockHeight: jest.fn().mockResolvedValue(100000),
  getBlockchainInfo: jest.fn().mockResolvedValue({ blockHeight: 100000, blockHash: 'abc', network: 'signet' }),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === ENV_REGISTER.LENDING) {
      return {
        onChainConfirmationThreshold: 6,
        liquidationLtvPct: 95,
        manualReviewBtcThreshold: 0.2,
        gracePeriodDays: 7,
      };
    }
  }),
};

describe('IndexerService', () => {
  let service: IndexerService;
  let loanService: ReturnType<typeof mockLoanService>;

  const loanId = new Types.ObjectId().toString();
  const escrowAddress = 'bcrt1qescrow00000000000000000000000000000000';

  const baseLoan = {
    _id: loanId,
    state: ELoanState.ORIGINATION_PENDING,
    escrow: {
      address: escrowAddress,
    },
    terms: {
      termDays: 90,
      graceDays: 7,
      termExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      graceExpiresAt: new Date(Date.now() + 97 * 24 * 60 * 60 * 1000),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    loanService = mockLoanService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        { provide: LoanService, useValue: loanService },
        { provide: UnisatService, useValue: mockUnisatService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);
  });

  describe('watchEscrowAddress', () => {
    it('should add address to internal watchedAddresses Map', () => {
      service.watchEscrowAddress(escrowAddress, loanId);
      // Access private map via any
      const map = (service as any).watchedAddresses as Map<string, unknown>;
      expect(map.has(escrowAddress)).toBe(true);
      expect((map.get(escrowAddress) as any).loanId).toBe(loanId);
    });
  });

  describe('unwatchAddress', () => {
    it('should remove address from watchedAddresses Map', () => {
      service.watchEscrowAddress(escrowAddress, loanId);
      service.unwatchAddress(escrowAddress);
      const map = (service as any).watchedAddresses as Map<string, unknown>;
      expect(map.has(escrowAddress)).toBe(false);
    });
  });

  describe('checkLoanExpiry', () => {
    it('should transition ACTIVE → GRACE when termExpiresBlock <= currentBlock', async () => {
      // mockUnisatService returns blockHeight 100000
      const expiredLoan = {
        ...baseLoan,
        state: ELoanState.ACTIVE,
        terms: { ...baseLoan.terms, termExpiresBlock: 99999 }, // already passed
      };
      loanService.find
        .mockResolvedValueOnce([expiredLoan])
        .mockResolvedValueOnce([]);
      loanService.transitionState.mockResolvedValue({ ...expiredLoan, state: ELoanState.GRACE });

      await service.checkLoanExpiry();

      expect(loanService.transitionState).toHaveBeenCalledWith(
        loanId,
        ELoanState.GRACE,
        expect.objectContaining({ termExpiredAtBlock: 100000 }),
      );
    });

    it('should transition GRACE → DEFAULTED when graceExpiresBlock <= currentBlock', async () => {
      const graceExpiredLoan = {
        ...baseLoan,
        state: ELoanState.GRACE,
        terms: { ...baseLoan.terms, graceExpiresBlock: 99998 },
      };
      loanService.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([graceExpiredLoan]);
      loanService.transitionState.mockResolvedValue({ ...graceExpiredLoan, state: ELoanState.DEFAULTED });

      await service.checkLoanExpiry();

      expect(loanService.transitionState).toHaveBeenCalledWith(
        loanId,
        ELoanState.DEFAULTED,
        expect.objectContaining({ graceExpiredAtBlock: 100000 }),
      );
    });

    it('should not transition if neither term nor grace has expired', async () => {
      loanService.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.checkLoanExpiry();
      expect(loanService.transitionState).not.toHaveBeenCalled();
    });

    it('should skip expiry check if block height unavailable', async () => {
      mockUnisatService.getLatestBlockHeight.mockResolvedValueOnce(0);
      await service.checkLoanExpiry();
      expect(loanService.find).not.toHaveBeenCalled();
    });
  });

  describe('checkPendingFunding', () => {
    it('should skip loans without escrow address', async () => {
      const loanWithoutEscrow = { ...baseLoan, escrow: {} };
      loanService.find.mockResolvedValue([loanWithoutEscrow]);

      await service.checkPendingFunding();
      // fetchUtxoStatus should never be called for loans without address
      expect(loanService.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should update escrow txid + vout when funding confirmed', async () => {
      const utxo = { txid: 'abc123', vout: 0, value: 100_000, confirmations: 6, isConfirmed: true };
      loanService.find.mockResolvedValue([baseLoan]);
      loanService.findByIdOrThrow.mockResolvedValue(baseLoan);
      loanService.findByIdAndUpdate.mockResolvedValue(baseLoan);
      loanService.transitionState.mockResolvedValue({ ...baseLoan, state: ELoanState.ACTIVE });
      jest.spyOn(service as any, 'fetchUtxoStatus').mockResolvedValue(utxo);

      await service.checkPendingFunding();

      expect(loanService.findByIdAndUpdate).toHaveBeenCalledWith(
        loanId,
        expect.objectContaining({
          $set: expect.objectContaining({
            'escrow.fundingTxid': utxo.txid,
            'escrow.fundingVout': utxo.vout,
          }),
        }),
      );
    });

    it('should set block height fields (originationBlock, termExpiresBlock, graceExpiresBlock) when funding confirmed', async () => {
      const utxo = { txid: 'abc123', vout: 0, value: 100_000, confirmations: 6, isConfirmed: true };
      loanService.find.mockResolvedValue([baseLoan]);
      loanService.findByIdOrThrow.mockResolvedValue(baseLoan);
      loanService.findByIdAndUpdate.mockResolvedValue(baseLoan);
      loanService.transitionState.mockResolvedValue({ ...baseLoan, state: ELoanState.ACTIVE });
      jest.spyOn(service as any, 'fetchUtxoStatus').mockResolvedValue(utxo);

      await service.checkPendingFunding();

      // blockHeight = 100000, termDays = 90, graceDays = 7
      // termExpiresBlock = 100000 + 90*144 = 112960
      // graceExpiresBlock = 112960 + 7*144 = 113968
      expect(loanService.findByIdAndUpdate).toHaveBeenCalledWith(
        loanId,
        expect.objectContaining({
          $set: expect.objectContaining({
            'terms.originationBlock': 100000,
            'terms.termExpiresBlock': 112960,
            'terms.graceExpiresBlock': 113968,
            'terms.originatedAt': expect.any(Date),
          }),
        }),
      );
    });
  });
});
