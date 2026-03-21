import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * In-memory UTXO lock service.
 * Prevents a lender from double-spending the same UTXO across multiple offers.
 * TODO: Replace with Redis-backed distributed lock for multi-instance deployments.
 */
@Injectable()
export class UtxoLockService {
  /** Map<lenderId, Set<"txid:vout">> */
  private readonly locks = new Map<string, Set<string>>();

  private key(txid: string, vout: number): string {
    return `${txid}:${vout}`;
  }

  private getOrCreate(lenderId: string): Set<string> {
    if (!this.locks.has(lenderId)) {
      this.locks.set(lenderId, new Set());
    }
    return this.locks.get(lenderId)!;
  }

  lockUtxos(lenderId: string, utxos: { txid: string; vout: number }[]): void {
    const set = this.getOrCreate(lenderId);
    for (const utxo of utxos) {
      set.add(this.key(utxo.txid, utxo.vout));
    }
  }

  releaseUtxos(lenderId: string, utxos: { txid: string; vout: number }[]): void {
    const set = this.locks.get(lenderId);
    if (!set) return;
    for (const utxo of utxos) {
      set.delete(this.key(utxo.txid, utxo.vout));
    }
  }

  releaseAllForLender(lenderId: string): void {
    this.locks.delete(lenderId);
  }

  isLocked(lenderId: string, txid: string, vout: number): boolean {
    return this.locks.get(lenderId)?.has(this.key(txid, vout)) ?? false;
  }

  /**
   * Throws BadRequestException if any UTXO is already locked by this lender.
   * Pass excludeRfqId for future Redis-backed impl (currently unused in-memory).
   */
  validateNoConflicts(
    lenderId: string,
    utxos: { txid: string; vout: number }[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _excludeRfqId?: string,
  ): void {
    const set = this.locks.get(lenderId);
    if (!set) return;
    for (const utxo of utxos) {
      if (set.has(this.key(utxo.txid, utxo.vout))) {
        throw new BadRequestException(
          `UTXO ${utxo.txid}:${utxo.vout} is already locked in another offer`,
        );
      }
    }
  }
}
