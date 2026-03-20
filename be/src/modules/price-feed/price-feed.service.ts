import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(PriceFeedService.name);
  private cachedPrice: number = 0;
  private lastUpdate: Date = new Date(0);

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<IPriceFeedConfig>(ENV_REGISTER.PRICE_FEED)!;
  }

  /**
   * Get the latest BTC price (cached, 60s TTL).
   */
  async getBtcPrice(): Promise<number> {
    if (this.cachedPrice > 0 && Date.now() - this.lastUpdate.getTime() < (this.config?.intervalMs ?? 60_000)) {
      return this.cachedPrice;
    }

    const feeds = await this.fetchAllFeeds();
    const validFeeds = feeds.filter((f) => f.isOk);

    if (validFeeds.length < 2) {
      this.logger.warn(`Only ${validFeeds.length} valid price feeds — using cached`);
      return this.cachedPrice || 0;
    }

    this.cachedPrice = this.calculateMedian(validFeeds.map((f) => f.price));
    this.lastUpdate = new Date();
    this.logger.log(`BTC price updated: $${this.cachedPrice.toFixed(2)} (${validFeeds.length} feeds)`);
    return this.cachedPrice;
  }

  /**
   * Check oracle differential — max diff between any two feeds.
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
    const threshold = this.config?.oracleDifferentialThresholdPct ?? 0.25;
    const isOk = maxDifferentialPct <= threshold;

    return { isOk, maxDifferentialPct, feeds };
  }

  /**
   * Fetch BTC/USD from all 5 sources in parallel.
   * Falls back gracefully if any source fails.
   */
  private async fetchAllFeeds(): Promise<IPriceResult[]> {
    const results = await Promise.allSettled([
      this.fetchCoinGecko(),
      this.fetchBinance(),
      this.fetchKraken(),
      this.fetchCoinbase(),
      this.fetchBybit(),
    ]);

    return results.map((r, i) => {
      const sources = ['coingecko', 'binance', 'kraken', 'coinbase', 'bybit'];
      if (r.status === 'fulfilled') return r.value;
      this.logger.warn(`Price feed ${sources[i]} failed: ${r.reason?.message}`);
      return { price: 0, source: sources[i], timestamp: new Date(), isOk: false };
    });
  }

  private async fetchCoinGecko(): Promise<IPriceResult> {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    return { price: data.bitcoin.usd, source: 'coingecko', timestamp: new Date(), isOk: true };
  }

  private async fetchBinance(): Promise<IPriceResult> {
    const res = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const data = await res.json();
    return { price: parseFloat(data.price), source: 'binance', timestamp: new Date(), isOk: true };
  }

  private async fetchKraken(): Promise<IPriceResult> {
    const res = await fetch(
      'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`Kraken ${res.status}`);
    const data = await res.json();
    const price = parseFloat(data.result?.XXBTZUSD?.c?.[0]);
    if (!price) throw new Error('Kraken: invalid response');
    return { price, source: 'kraken', timestamp: new Date(), isOk: true };
  }

  private async fetchCoinbase(): Promise<IPriceResult> {
    const res = await fetch(
      'https://api.coinbase.com/v2/prices/BTC-USD/spot',
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`Coinbase ${res.status}`);
    const data = await res.json();
    return { price: parseFloat(data.data.amount), source: 'coinbase', timestamp: new Date(), isOk: true };
  }

  private async fetchBybit(): Promise<IPriceResult> {
    const res = await fetch(
      'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT',
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`Bybit ${res.status}`);
    const data = await res.json();
    const price = parseFloat(data.result?.list?.[0]?.lastPrice);
    if (!price) throw new Error('Bybit: invalid response');
    return { price, source: 'bybit', timestamp: new Date(), isOk: true };
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
