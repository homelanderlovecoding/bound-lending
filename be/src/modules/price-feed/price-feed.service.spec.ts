import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PriceFeedService, IPriceResult } from './price-feed.service';
import { ENV_REGISTER } from '../../commons/constants';

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === ENV_REGISTER.PRICE_FEED) {
      return {
        intervalMs: 60000, // 60s cache
        oracleDifferentialThresholdPct: 0.25,
      };
    }
  }),
};

function makeFeed(price: number, source = 'test'): IPriceResult {
  return { price, source, timestamp: new Date(), isOk: true };
}

describe('PriceFeedService', () => {
  let service: PriceFeedService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceFeedService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PriceFeedService>(PriceFeedService);
  });

  describe('getBtcPrice', () => {
    it('should return cached price if cache is fresh', async () => {
      const feeds = [
        makeFeed(91000, 'coingecko'),
        makeFeed(91100, 'binance'),
        makeFeed(91050, 'coinmarketcap'),
      ];
      const fetchSpy = jest
        .spyOn(service as any, 'fetchAllFeeds')
        .mockResolvedValue(feeds);

      // First call — populates cache
      await service.getBtcPrice();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call immediately after — should use cache
      await service.getBtcPrice();
      expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1
    });

    it('should fetch new price if cache is stale', async () => {
      const feeds = [
        makeFeed(91000, 'coingecko'),
        makeFeed(91100, 'binance'),
        makeFeed(91050, 'coinmarketcap'),
      ];
      const fetchSpy = jest
        .spyOn(service as any, 'fetchAllFeeds')
        .mockResolvedValue(feeds);

      // First call
      await service.getBtcPrice();

      // Force cache stale
      (service as any).lastUpdate = new Date(0);

      // Second call — should refetch
      await service.getBtcPrice();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should return 0 (fallback) if fewer than 2 feeds respond', async () => {
      jest.spyOn(service as any, 'fetchAllFeeds').mockResolvedValue([
        makeFeed(91000, 'coingecko'),
        { price: 0, source: 'binance', timestamp: new Date(), isOk: false },
        { price: 0, source: 'coinmarketcap', timestamp: new Date(), isOk: false },
        { price: 0, source: 'hyperliquid', timestamp: new Date(), isOk: false },
        { price: 0, source: 'kraken', timestamp: new Date(), isOk: false },
      ]);

      const price = await service.getBtcPrice();
      expect(price).toBe(0);
    });
  });

  describe('checkOracleDifferential', () => {
    it('should return isOk=true when 5 feeds agree (odd count — tests median path)', async () => {
      jest.spyOn(service as any, 'fetchAllFeeds').mockResolvedValue([
        makeFeed(91000, 'a'),
        makeFeed(91010, 'b'),
        makeFeed(91020, 'c'),
        makeFeed(91005, 'd'),
        makeFeed(91015, 'e'),
      ]);

      const result = await service.checkOracleDifferential();
      expect(result.isOk).toBe(true);
      expect(result.maxDifferentialPct).toBeLessThanOrEqual(0.25);
    });

    it('should return isOk=true when 4 feeds agree (even count — tests median path)', async () => {
      jest.spyOn(service as any, 'fetchAllFeeds').mockResolvedValue([
        makeFeed(91000, 'a'),
        makeFeed(91010, 'b'),
        makeFeed(91020, 'c'),
        makeFeed(91005, 'd'),
      ]);

      const result = await service.checkOracleDifferential();
      expect(result.isOk).toBe(true);
    });

    it('should return isOk=false when feeds diverge > 0.25%', async () => {
      // 91000 vs 91500 → diff ≈ 0.55%
      jest.spyOn(service as any, 'fetchAllFeeds').mockResolvedValue([
        makeFeed(91000, 'a'),
        makeFeed(91100, 'b'),
        makeFeed(91500, 'c'), // outlier
        makeFeed(91050, 'd'),
        makeFeed(91010, 'e'),
      ]);

      const result = await service.checkOracleDifferential();
      expect(result.isOk).toBe(false);
      expect(result.maxDifferentialPct).toBeGreaterThan(0.25);
    });

    it('should detect correct max pairwise differential (outlier at one extreme)', async () => {
      // Feed A=90000, others ≈91000 → max diff between A and others ≈ 1.1%
      jest.spyOn(service as any, 'fetchAllFeeds').mockResolvedValue([
        makeFeed(90000, 'a'), // outlier low
        makeFeed(91000, 'b'),
        makeFeed(91010, 'c'),
        makeFeed(91005, 'd'),
        makeFeed(91020, 'e'),
      ]);

      const result = await service.checkOracleDifferential();
      // Max diff: |90000 - 91020| / 90000 * 100 ≈ 1.13%
      expect(result.maxDifferentialPct).toBeGreaterThan(1.0);
      expect(result.isOk).toBe(false);
    });
  });
});
