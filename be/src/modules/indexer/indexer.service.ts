import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ENV_REGISTER, EVENT } from '../../commons/constants';
import { ILendingConfig } from '../../commons/types';
import { LoanEntity, ELoanState } from '../../database/entities';
import { LoanService } from '../loan/loan.service';
import { UnisatService } from '../unisat/unisat.service';
import { IWatchedAddress, IUtxoStatus } from './indexer.type';

/** Approximate blocks per day on Bitcoin/signet (10 min avg) */
const BLOCKS_PER_DAY = 144;

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private readonly lendingConfig: ILendingConfig;
  private readonly watchedAddresses = new Map<string, IWatchedAddress>();

  constructor(
    private readonly loanService: LoanService,
    private readonly unisatService: UnisatService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.lendingConfig = this.configService.get<ILendingConfig>(ENV_REGISTER.LENDING)!;
  }

  /**
   * Start watching an escrow address for funding.
   */
  watchEscrowAddress(address: string, loanId: string): void {
    this.watchedAddresses.set(address, { address, loanId, type: 'escrow' });
    this.logger.log(`Watching escrow address ${address} for loan ${loanId}`);
  }

  /**
   * Stop watching an address (loan closed).
   */
  unwatchAddress(address: string): void {
    this.watchedAddresses.delete(address);
  }

  /**
   * Poll all watched addresses for changes.
   * Called by BullMQ every ~10s.
   */
  async pollWatchedAddresses(): Promise<void> {
    for (const [address, watched] of this.watchedAddresses) {
      await this.checkAddress(watched);
    }
  }

  /**
   * Check funding status for AWAITING_FUNDING loans.
   */
  async checkPendingFunding(): Promise<void> {
    const pendingLoans = await this.loanService.find({
      state: ELoanState.ORIGINATION_PENDING,
    });

    for (const loan of pendingLoans) {
      if (!loan.escrow?.address) continue;
      await this.checkEscrowFunding(loan);
    }
  }

  /**
   * Check for term/grace expiry on active loans using block height.
   */
  async checkLoanExpiry(): Promise<void> {
    const currentBlock = await this.unisatService.getLatestBlockHeight();
    if (currentBlock === 0) {
      this.logger.warn('Could not fetch block height, skipping expiry check');
      return;
    }
    await this.checkTermExpiry(currentBlock);
    await this.checkGraceExpiry(currentBlock);
  }

  /**
   * Check a specific address for UTXO activity.
   * TODO: Replace with real Bitcoin Core RPC / mempool.space API calls.
   */
  private async checkAddress(watched: IWatchedAddress): Promise<void> {
    const utxo = await this.fetchUtxoStatus(watched.address);
    if (!utxo) return;

    if (watched.type === 'escrow') {
      await this.handleEscrowUtxo(watched.loanId, utxo);
    }
  }

  private async checkEscrowFunding(loan: LoanEntity): Promise<void> {
    const utxo = await this.fetchUtxoStatus(loan.escrow.address);
    if (!utxo || !utxo.isConfirmed) return;

    if (utxo.confirmations >= this.lendingConfig.onChainConfirmationThreshold) {
      await this.handleFundingConfirmed(loan, utxo);
    }
  }

  private async handleEscrowUtxo(loanId: string, utxo: IUtxoStatus): Promise<void> {
    if (utxo.confirmations >= this.lendingConfig.onChainConfirmationThreshold) {
      await this.handleFundingConfirmed(
        await this.loanService.findByIdOrThrow(loanId),
        utxo,
      );
    }
  }

  private async handleFundingConfirmed(loan: LoanEntity, utxo: IUtxoStatus): Promise<void> {
    const loanId = loan._id.toString();
    this.logger.log(`Funding confirmed for loan ${loanId}: ${utxo.txid}`);

    const originationBlock = await this.unisatService.getLatestBlockHeight();
    const termExpiresBlock = originationBlock + loan.terms.termDays * BLOCKS_PER_DAY;
    const graceExpiresBlock = termExpiresBlock + loan.terms.graceDays * BLOCKS_PER_DAY;

    // Timestamp equivalents for display only
    const now = new Date();
    const msPerBlock = 10 * 60 * 1000;

    await this.loanService.findByIdAndUpdate(loanId, {
      $set: {
        'escrow.fundingTxid': utxo.txid,
        'escrow.fundingVout': utxo.vout,
        // Block height fields (enforcement)
        'terms.originationBlock': originationBlock,
        'terms.termExpiresBlock': termExpiresBlock,
        'terms.graceExpiresBlock': graceExpiresBlock,
        // Timestamp fields (display only)
        'terms.originatedAt': now,
        'terms.termExpiresAt': new Date(now.getTime() + loan.terms.termDays * msPerBlock * BLOCKS_PER_DAY),
        'terms.graceExpiresAt': new Date(now.getTime() + (loan.terms.termDays + loan.terms.graceDays) * msPerBlock * BLOCKS_PER_DAY),
      },
    });

    await this.loanService.transitionState(loanId, ELoanState.ACTIVE, {
      txid: utxo.txid,
      confirmations: utxo.confirmations,
      originationBlock,
    });
  }

  private async checkTermExpiry(currentBlock: number): Promise<void> {
    const expiredLoans = await this.loanService.find({
      state: ELoanState.ACTIVE,
      'terms.termExpiresBlock': { $lte: currentBlock },
    });

    for (const loan of expiredLoans) {
      this.logger.log(`Term expired for loan ${loan._id} at block ${currentBlock}`);
      await this.loanService.transitionState(
        loan._id.toString(),
        ELoanState.GRACE,
        { termExpiredAtBlock: currentBlock },
      );
    }
  }

  private async checkGraceExpiry(currentBlock: number): Promise<void> {
    const defaultedLoans = await this.loanService.find({
      state: ELoanState.GRACE,
      'terms.graceExpiresBlock': { $lte: currentBlock },
    });

    for (const loan of defaultedLoans) {
      this.logger.log(`Grace expired for loan ${loan._id} at block ${currentBlock}`);
      await this.loanService.transitionState(
        loan._id.toString(),
        ELoanState.DEFAULTED,
        { graceExpiredAtBlock: currentBlock },
      );
    }
  }

  /**
   * Fetch UTXO status for an address.
   * TODO: Implement via Bitcoin Core RPC or mempool.space API.
   */
  private async fetchUtxoStatus(address: string): Promise<IUtxoStatus | null> {
    // MVP: stub — return null (no UTXO found)
    // Replace with actual chain query
    return null;
  }
}
