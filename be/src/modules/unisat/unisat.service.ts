import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENV_REGISTER } from '../../commons/constants';
import { IUnisatConfig } from '../../commons/types';
import { IUnisatBalanceResult, IUnisatUtxoRuneBalance } from './unisat.type';

@Injectable()
export class UnisatService {
  private readonly logger = new Logger(UnisatService.name);
  private readonly config: IUnisatConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<IUnisatConfig>(ENV_REGISTER.UNISAT)!;
  }

  /**
   * Get on-chain Rune balance for a specific address + runeId.
   * Uses UniSat indexer — source of truth for on-chain state.
   * GET /v1/indexer/runes/address/{address}/{runeid}/balance
   */
  async getRuneBalance(address: string, runeId?: string): Promise<IUnisatBalanceResult> {
    const targetRuneId = runeId ?? this.config.busdRuneId;
    const url = `${this.config.baseUrl}/v1/indexer/runes/address/${encodeURIComponent(address)}/${encodeURIComponent(targetRuneId)}/balance`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error(`UniSat balance HTTP ${res.status}`);

      const json = await res.json();
      if (json.code !== 0) {
        this.logger.warn(`UniSat API error: ${json.msg}`);
        return this.emptyBalance(address, targetRuneId);
      }

      const data = json.data;
      const divisibility: number = data?.divisibility ?? 0;
      const amountRaw: string = data?.amount ?? '0';
      const amount = Number(BigInt(amountRaw)) / 10 ** divisibility;

      return {
        address,
        runeId: targetRuneId,
        amount,
        amountRaw,
        divisibility,
      };
    } catch (error) {
      this.logger.error(`UniSat balance fetch failed for ${address}/${targetRuneId}: ${error}`);
      return this.emptyBalance(address, targetRuneId);
    }
  }

  /**
   * Get on-chain bUSD balance for an address (uses configured BUSD_RUNE_ID).
   */
  async getBusdBalance(address: string): Promise<IUnisatBalanceResult> {
    return this.getRuneBalance(address, this.config.busdRuneId);
  }

  /**
   * Get Rune balance for a specific UTXO (for PSBT input validation).
   * GET /v1/indexer/runes/utxo/{txid}/{index}/balance
   */
  async getUtxoRuneBalance(txid: string, vout: number): Promise<IUnisatUtxoRuneBalance[]> {
    const url = `${this.config.baseUrl}/v1/indexer/runes/utxo/${txid}/${vout}/balance`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error(`UniSat UTXO balance HTTP ${res.status}`);

      const json = await res.json();
      if (json.code !== 0) {
        this.logger.warn(`UniSat UTXO balance API error: ${json.msg}`);
        return [];
      }

      return Array.isArray(json.data) ? json.data : [];
    } catch (error) {
      this.logger.error(`UniSat UTXO balance fetch failed for ${txid}:${vout}: ${error}`);
      return [];
    }
  }

  /**
   * Verify a borrower has sufficient BTC balance on-chain.
   * Uses UniSat address info endpoint.
   * GET /v1/indexer/address/{address}/balance
   */
  async getBtcBalance(address: string): Promise<number> {
    const url = `${this.config.baseUrl}/v1/indexer/address/${encodeURIComponent(address)}/balance`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error(`UniSat address balance HTTP ${res.status}`);

      const json = await res.json();
      if (json.code !== 0) return 0;

      // satoshi field in UniSat response
      return json.data?.satoshi ?? 0;
    } catch (error) {
      this.logger.error(`UniSat BTC balance fetch failed for ${address}: ${error}`);
      return 0;
    }
  }

  /**
   * Get current blockchain info including latest block height.
   * GET /v1/indexer/blockchain/info
   */
  async getBlockchainInfo(): Promise<{ blockHeight: number; blockHash: string; network: string }> {
    const url = `${this.config.baseUrl}/v1/indexer/blockchain/info`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error(`UniSat blockchain info HTTP ${res.status}`);

      const json = await res.json();
      if (json.code !== 0) throw new Error(`UniSat API error: ${json.msg}`);

      return {
        blockHeight: json.data?.blocks ?? json.data?.bestHeight ?? 0,
        blockHash: json.data?.bestBlockHash ?? '',
        network: json.data?.chain ?? 'signet',
      };
    } catch (error) {
      this.logger.error(`UniSat blockchain info fetch failed: ${error}`);
      return { blockHeight: 0, blockHash: '', network: 'signet' };
    }
  }

  /**
   * Get latest block height only (convenience method).
   */
  async getLatestBlockHeight(): Promise<number> {
    const info = await this.getBlockchainInfo();
    return info.blockHeight;
  }

  /**
   * Fetch BTC UTXOs for an address.
   * GET /v1/indexer/address/{address}/utxo-data
   */
  async fetchBtcUtxos(address: string): Promise<{ txid: string; vout: number; satoshi: number }[]> {
    const url = `${this.config.baseUrl}/v1/indexer/address/${encodeURIComponent(address)}/utxo-data?cursor=0&size=100`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`UniSat BTC UTXOs HTTP ${res.status}`);
      const json = await res.json();
      if (json.code !== 0) return [];
      return (json.data?.utxo ?? []).map((u: any) => ({
        txid: u.txid,
        vout: u.vout,
        satoshi: u.satoshi,
      }));
    } catch (error) {
      this.logger.error(`UniSat BTC UTXOs fetch failed for ${address}: ${error}`);
      return [];
    }
  }

  /**
   * Fetch Rune UTXOs for an address + runeId.
   * GET /v1/indexer/runes/address/{address}/{runeid}/utxo
   * Returns UTXOs that hold the specified Rune.
   */
  async fetchRuneUtxos(address: string, runeId?: string): Promise<{ txid: string; vout: number; satoshi: number; runeAmount: string }[]> {
    const targetRuneId = runeId ?? this.config.busdRuneId;
    const url = `${this.config.baseUrl}/v1/indexer/address/${encodeURIComponent(address)}/runes/${encodeURIComponent(targetRuneId)}/utxo`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`UniSat Rune UTXOs HTTP ${res.status}`);
      const json = await res.json();
      if (json.code !== 0) return [];
      return (json.data?.utxo ?? json.data ?? []).map((u: any) => ({
        txid: u.txid,
        vout: u.vout,
        satoshi: u.satoshi ?? 546,
        runeAmount: u.runes?.[0]?.amount ?? u.amount ?? '0',
      }));
    } catch (error) {
      this.logger.error(`UniSat Rune UTXOs fetch failed for ${address}/${targetRuneId}: ${error}`);
      return [];
    }
  }

  private emptyBalance(address: string, runeId: string): IUnisatBalanceResult {
    return { address, runeId, amount: 0, amountRaw: '0', divisibility: 0 };
  }
}
