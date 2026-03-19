import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENV_REGISTER, RESPONSE_CODE } from '../../commons/constants';
import { IRadFiConfig } from '../../commons/types';
import { IRadFiBalanceResult, IRadFiRuneBalance, IRadFiUtxo } from './radfi.type';

@Injectable()
export class RadFiService {
  private readonly logger = new Logger(RadFiService.name);
  private readonly config: IRadFiConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<IRadFiConfig>(ENV_REGISTER.RADFI)!;
  }

  /**
   * Get BTC + bUSD balance for a Trading Wallet address.
   */
  async getWalletBalance(address: string): Promise<IRadFiBalanceResult> {
    const [btcSatoshi, runeBalances] = await Promise.all([
      this.fetchBtcBalance(address),
      this.fetchRuneBalance(address, this.config.busdRuneId),
    ]);

    const busdRune = runeBalances.find((r) => r.runeid === this.config.busdRuneId);

    return {
      address,
      btcSatoshi,
      btcAmount: btcSatoshi / 1e8,
      busdAmount: busdRune ? this.parseRuneAmount(busdRune) : 0,
      busdRaw: busdRune?.amount ?? '0',
      runeId: this.config.busdRuneId,
    };
  }

  /**
   * Get BTC balance (in satoshis) for an address.
   */
  async fetchBtcBalance(address: string): Promise<number> {
    const url = `${this.config.baseUrl}/api/wallets/balance?address=${encodeURIComponent(address)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`RadFi balance HTTP ${res.status}`);
      const json = await res.json();
      return json?.data?.satoshi ?? 0;
    } catch (error) {
      this.logger.error(`RadFi BTC balance fetch failed for ${address}: ${error}`);
      return 0;
    }
  }

  /**
   * Get Rune balances for an address (optionally filtered by runeId).
   */
  async fetchRuneBalance(address: string, runeId?: string): Promise<IRadFiRuneBalance[]> {
    const params = new URLSearchParams({ address });
    if (runeId) params.set('runeId', runeId);

    const url = `${this.config.baseUrl}/api/wallets/runes/balance?${params.toString()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`RadFi rune balance HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    } catch (error) {
      this.logger.error(`RadFi rune balance fetch failed for ${address}: ${error}`);
      return [];
    }
  }

  /**
   * Get UTXOs for an address (for PSBT construction).
   * Note: RadFi /api/utxos returns UTXOs for the authenticated Trading Wallet,
   * not by address — this is a platform-level endpoint.
   */
  async fetchUtxos(): Promise<IRadFiUtxo[]> {
    const url = `${this.config.baseUrl}/api/utxos`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`RadFi UTXOs HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    } catch (error) {
      this.logger.error(`RadFi UTXOs fetch failed: ${error}`);
      return [];
    }
  }

  /**
   * Verify a borrower has sufficient BTC collateral in their Trading Wallet.
   */
  async verifyBtcBalance(address: string, requiredSatoshi: number): Promise<boolean> {
    const balance = await this.fetchBtcBalance(address);
    if (balance < requiredSatoshi) {
      this.logger.warn(
        `Insufficient BTC: ${address} has ${balance} satoshi, needs ${requiredSatoshi}`,
      );
      return false;
    }
    return true;
  }

  /**
   * Verify a lender has sufficient bUSD Rune balance.
   */
  async verifyBusdBalance(address: string, requiredAmount: number): Promise<boolean> {
    const runes = await this.fetchRuneBalance(address, this.config.busdRuneId);
    const busdRune = runes.find((r) => r.runeid === this.config.busdRuneId);
    const available = busdRune ? this.parseRuneAmount(busdRune) : 0;

    if (available < requiredAmount) {
      this.logger.warn(
        `Insufficient bUSD: ${address} has ${available}, needs ${requiredAmount}`,
      );
      return false;
    }
    return true;
  }

  /**
   * Parse rune amount accounting for divisibility.
   * amount is a raw integer string — divide by 10^divisibility for human amount.
   */
  private parseRuneAmount(rune: IRadFiRuneBalance): number {
    const raw = BigInt(rune.amount);
    const divisor = BigInt(10 ** rune.divisibility);
    return Number(raw) / Number(divisor);
  }
}
