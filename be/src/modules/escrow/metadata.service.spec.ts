import { Test, TestingModule } from '@nestjs/testing';
import { MetadataService, IOriginationMetadata, IRepaymentMetadata } from './metadata.service';

describe('MetadataService', () => {
  let service: MetadataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetadataService],
    }).compile();
    service = module.get<MetadataService>(MetadataService);
  });

  describe('origination metadata', () => {
    const originationData: IOriginationMetadata = {
      type: 'origination',
      loanId: 'LN-0041',
      amountUsd: 25000,
      collateralBtc: 0.548722,
      rateApr: 5.2,
      originationDate: '2026-02-12',
      repaymentDate: '2026-05-13',
      lenderId: 'lender-001',
      borrowerId: 'borrower-001',
    };

    it('should encode and decode origination metadata round-trip', () => {
      const encoded = service.encodeMetadata(originationData);
      const decoded = service.decodeMetadata(encoded);

      expect(decoded).toEqual(originationData);
    });

    it('should start with BNDL magic bytes', () => {
      const encoded = service.encodeMetadata(originationData);
      expect(encoded[0]).toBe(0x42); // B
      expect(encoded[1]).toBe(0x4e); // N
      expect(encoded[2]).toBe(0x44); // D
      expect(encoded[3]).toBe(0x4c); // L
    });

    it('should have version byte after magic', () => {
      const encoded = service.encodeMetadata(originationData);
      expect(encoded[4]).toBe(0x01);
    });
  });

  describe('repayment metadata', () => {
    const repaymentData: IRepaymentMetadata = {
      type: 'repayment',
      loanId: 'LN-0041',
      repayDate: '2026-04-15',
      principalRepaid: 25050,
      interestPaid: 428.08,
      daysOutstanding: 62,
    };

    it('should encode and decode repayment metadata round-trip', () => {
      const encoded = service.encodeMetadata(repaymentData);
      const decoded = service.decodeMetadata(encoded);

      expect(decoded).toEqual(repaymentData);
    });
  });

  describe('error handling', () => {
    it('should reject buffer with wrong magic bytes', () => {
      const badBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, 0xa1]);
      expect(() => service.decodeMetadata(badBuffer)).toThrow();
    });

    it('should reject buffer with wrong version', () => {
      const badBuffer = Buffer.from([0x42, 0x4e, 0x44, 0x4c, 0xff, 0xa1]);
      expect(() => service.decodeMetadata(badBuffer)).toThrow();
    });

    it('should reject buffer too short', () => {
      const badBuffer = Buffer.from([0x42, 0x4e]);
      expect(() => service.decodeMetadata(badBuffer)).toThrow();
    });
  });
});
