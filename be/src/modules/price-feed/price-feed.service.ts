import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENV_REGISTER } from '../../commons/constants';
import { IPriceFeedConfig } from '../../commons/types';

export interface IPriceResult {
  price: number;
  source: string;
  timestamp: Date;
  isOk: boolean;
}

@Injectable()
export class PriceFeedService {
  private readonly config: IPriceFeedConfig;
  private cachedPrice: number = 0;
  private lastUpdate: Date = new Date(0);

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<IPriceFeedConfig>(ENV_REGISTER.PRICE_FEED)!;
  }

  /**
   * Get the latest BTC price (cached).
   */
  async getBtcPrice(): Promise<number> {
    // If cache is fresh (< 60s), return cached
    if (this.cachedPrice > 0 && Date.now() - this.lastUpdate.getTime() < this.config.intervalMs) {
      return this.cachedPrice;
    }

    const feeds = await this.fetchAllFeeds();
    const validFeeds = feeds.filter((f) => f.isOk);

    if (validFeeds.length < 3) {
      // Not enough feeds — return cached or throw
      return this.cachedPrice || 0;
    }

    this.cachedPrice = this.calculateMedian(validFeeds.map((f) => f.price));
    this.lastUpdate = new Date();
    return this.cachedPrice;
  }

  /**
   * Check oracle differential — max diff between any two feeds.
   * Returns true if ≤ threshold.
   */
  async checkOracleDifferential(): Promise<{
    isOk: boolean;
    maxDifferentialPct: number;
    feeds: IPriceResult[];
  }> {
    const feeds = await this.fetchAllFeeds();
    const validPrices = feeds.filter((f) => f.isOk).map((f) => f.price);

    if (validPrices.length < 2) {
      return { isOk: false, maxDifferentialPct: Infinity, feeds };
    }

    const maxDifferentialPct = this.calculateMaxDifferential(validPrices);
    const isOk = maxDifferentialPct <= this.config.oracleDifferentialThresholdPct;

    return { isOk, maxDifferentialPct, feeds };
  }

  /**
   * Fetch from all 5 price feed sources.
   * TODO: Implement actual API calls. Currently returns mock data.
   */
  private async fetchAllFeeds(): Promise<IPriceResult[]> {
    // MVP: Mock implementation — replace with real API calls
    const mockPrice = this.cachedPrice || 91183.76;
    const sources = ['coingecko', 'binance', 'coinmarketcap', 'hyperliquid', 'kraken'];

    return sources.map((source) => ({
      price: mockPrice + (Math.random() - 0.5) * 20, // ±$10 jitter
      source,
      timestamp: new Date(),
      isOk: true,
    }));
  }

  private calculateMedian(prices: number[]): number {
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculateMaxDifferential(prices: number[]): number {
    let maxDiff = 0;
    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        const diff = Math.abs(prices[i] - prices[j]) / Math.min(prices[i], prices[j]) * 100;
        maxDiff = Math.max(maxDiff, diff);
      }
    }
    return maxDiff;
  }
}
