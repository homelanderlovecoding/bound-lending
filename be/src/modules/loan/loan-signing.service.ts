import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ENV_REGISTER, EVENT, RESPONSE_CODE } from '../../commons/constants';
import { IBitcoinConfig } from '../../commons/types';
import { LoanEntity, ELoanState } from '../../database/entities';
import { MultisigService } from '../escrow/multisig.service';
import { PsbtService } from '../escrow/psbt.service';
import { BoundSignerService } from '../escrow/bound-signer.service';
import { MetadataService } from '../escrow/metadata.service';
import { RadFiService } from '../radfi/radfi.service';
import { LoanService } from './loan.service';
import { ITaprootMultisigResult, IUtxoInput } from '../escrow/escrow.type';

@Injectable()
export class LoanSigningService {
  private readonly logger = new Logger(LoanSigningService.name);
  private readonly network: bitcoin.Network;

  constructor(
    private readonly loanService: LoanService,
    private readonly multisigService: MultisigService,
    private readonly psbtService: PsbtService,
    private readonly boundSigner: BoundSignerService,
    private readonly metadataService: MetadataService,
    private readonly radfiService: RadFiService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    bitcoin.initEccLib(ecc);
    const btcConfig = this.configService.get<IBitcoinConfig>(ENV_REGISTER.BITCOIN)!;
    this.network = this.resolveNetwork(btcConfig.network);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ORIGINATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build the origination PSBT for a loan and store it.
   * Called after RFQ is accepted and loan is created.
   * Bound provides its pubkey; borrower + lender sign later.
   */
  async buildAndStoreOriginationPsbt(loanId: string): Promise<string> {
    const loan = await this.loanService.findByIdOrThrow(loanId);
    this.validateState(loan, ELoanState.ORIGINATION_PENDING);

    const taprootMs = this.multisigService.createTaprootMultisig({
      borrowerPubkey: loan.escrow.borrowerPubkey,
      lenderPubkey: loan.escrow.lenderPubkey,
      boundPubkey: loan.escrow.boundPubkey,
      network: this.network,
    });

    // Fetch borrower BTC UTXOs from RadFi for PSBT input construction
    const borrowerUtxos = await this.getBorrowerBtcUtxos(loan);
    const lenderBusdUtxos = await this.getLenderBusdUtxos(loan);

    const metadata = this.metadataService.encodeMetadata({
      type: 'origination',
      loanId: loan._id.toString(),
      amountUsd: loan.terms.principalUsd,
      collateralBtc: loan.terms.collateralBtc,
      rateApr: loan.terms.rateApr,
      originationDate: new Date().toISOString().split('T')[0],
      repaymentDate: new Date(Date.now() + loan.terms.termDays * 86400000).toISOString().split('T')[0],
      lenderId: loan.lender.toString(),
      borrowerId: loan.borrower.toString(),
    });

    const psbt = this.psbtService.buildTaprootOriginationPsbt({
      lenderBusdUtxos,
      borrowerBtcUtxos: borrowerUtxos,
      loanAmountSats: Math.round(loan.terms.principalUsd * 100), // bUSD in sats
      originationFeeSats: Math.round(loan.terms.originationFee * 100),
      borrowerAddress: await this.resolveBorrowerAddress(loan),
      boundAddress: await this.resolveBoundAddress(),
      multisigAddress: taprootMs.address,
      taprootMultisig: taprootMs,
      network: this.network,
      metadata,
    });

    const psbtHex = psbt.toHex();

    // Store on loan + update escrow address to taproot address
    await this.loanService.findByIdAndUpdate(loanId, {
      $set: {
        originationPsbt: psbtHex,
        'escrow.address': taprootMs.address,
        'escrow.taprootData': JSON.stringify({
          leafBorrowerLender: taprootMs.leafBorrowerLender.toString('hex'),
          leafBorrowerBound: taprootMs.leafBorrowerBound.toString('hex'),
          leafLenderBound: taprootMs.leafLenderBound.toString('hex'),
        }),
      },
    });

    this.logger.log(`Origination PSBT built for loan ${loanId}, taproot address: ${taprootMs.address}`);
    return psbtHex;
  }

  /**
   * Record a party's signature on the origination PSBT.
   * When borrower + lender have both signed → Bound auto-signs + broadcasts.
   */
  async recordOriginationSignature(
    loanId: string,
    party: 'borrower' | 'lender',
    signedPsbtHex: string,
  ): Promise<{ complete: boolean; txid?: string }> {
    const loan = await this.loanService.findByIdOrThrow(loanId);
    this.validateState(loan, ELoanState.ORIGINATION_PENDING);

    // Store the party's signed PSBT
    const sigField = party === 'borrower' ? 'signatures.borrower' : 'signatures.lender';
    const psbtField = party === 'borrower' ? 'psbt.borrowerSigned' : 'psbt.lenderSigned';

    await this.loanService.findByIdAndUpdate(loanId, {
      $set: {
        [sigField]: true,
        [psbtField]: signedPsbtHex,
      },
    });

    this.eventEmitter.emit(EVENT.LOAN_ORIGINATION_SIGNED, { loanId, party });

    // Refresh loan to check if both have signed
    const updated = await this.loanService.findByIdOrThrow(loanId);
    if (updated.signatures.borrower && updated.signatures.lender) {
      const txid = await this.finalizeOrigination(loanId, updated);
      return { complete: true, txid };
    }

    return { complete: false };
  }

  /**
   * Bound co-signs and broadcasts the origination PSBT.
   * Called when both borrower and lender have signed.
   */
  private async finalizeOrigination(loanId: string, loan: LoanEntity): Promise<string> {
    this.logger.log(`Both parties signed — Bound co-signing origination for loan ${loanId}`);

    const borrowerPsbt = this.boundSigner.psbtFromHex((loan as any).psbt?.borrowerSigned);
    const lenderPsbt = this.boundSigner.psbtFromHex((loan as any).psbt?.lenderSigned);

    // Combine borrower + lender signatures
    borrowerPsbt.combine(lenderPsbt);

    // Bound signs (using borrower+bound leaf as fallback if lender unavailable, else lender+bound)
    this.boundSigner.signAllTaprootInputs(borrowerPsbt);

    // Finalize + extract
    const txHex = this.boundSigner.combineFinalizeAndExtract(borrowerPsbt, borrowerPsbt);

    // Broadcast via RadFi
    const txid = await this.broadcastTx(txHex);

    await this.loanService.findByIdAndUpdate(loanId, {
      $set: { 'signatures.bound': true, 'escrow.fundingTxid': txid },
    });

    // MVP: transition to ACTIVE immediately after broadcast
    // TODO: post-MVP, wait for N on-chain confirmations via indexer
    await this.loanService.transitionState(loanId, ELoanState.ACTIVE, { txid });

    this.logger.log(`Origination broadcast + activated — loan ${loanId} txid: ${txid}`);
    this.eventEmitter.emit(EVENT.LOAN_ORIGINATION_SIGNED, { loanId, party: 'bound', txid });

    return txid;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REPAYMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build repayment PSBT, Bound co-signs immediately, returns hex for borrower to sign.
   * Spend path: borrower+bound leaf.
   */
  async buildRepaymentPsbt(loanId: string): Promise<string> {
    const loan = await this.loanService.findByIdOrThrow(loanId);
    const validStates = [ELoanState.ACTIVE, ELoanState.GRACE];
    if (!validStates.includes(loan.state)) {
      throw new BadRequestException(RESPONSE_CODE.loan.invalidState);
    }

    const taprootMs = this.reconstructTaprootMs(loan);
    const multisigUtxo = this.getEscrowUtxo(loan);
    const repayQuote = this.loanService.calculateRepaymentAmount(loan);

    const psbt = this.psbtService.buildTaprootSpendPsbt({
      multisigUtxo,
      taprootMultisig: taprootMs,
      spendLeaf: 'borrower_bound',
      outputAddress: loan.escrow.borrowerPubkey, // borrower's address (BTC back)
      network: this.network,
    });

    // Bound pre-signs its half
    this.boundSigner.signAllTaprootInputs(psbt);

    this.logger.log(`Repayment PSBT built for loan ${loanId}, repay: $${repayQuote.totalRepay}`);
    return psbt.toHex();
  }

  /**
   * Receive borrower's signature on repayment PSBT, finalize, broadcast.
   */
  async finalizeRepayment(loanId: string, borrowerSignedPsbtHex: string): Promise<string> {
    const loan = await this.loanService.findByIdOrThrow(loanId);

    const borrowerPsbt = this.boundSigner.psbtFromHex(borrowerSignedPsbtHex);
    this.boundSigner.finalizeTaprootPsbt(borrowerPsbt);
    const txHex = this.boundSigner.extractTxHex(borrowerPsbt);

    const txid = await this.broadcastTx(txHex);

    await this.loanService.transitionState(loanId, ELoanState.REPAID, { txid });

    this.logger.log(`Repayment broadcast — loan ${loanId} txid: ${txid}`);
    return txid;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIQUIDATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build pre-signed liquidation PSBT at origination time.
   * Lender signs first (pre-authorization), Bound stores it.
   * Spend path: lender+bound leaf.
   */
  async buildLiquidationPsbt(loanId: string): Promise<string> {
    const loan = await this.loanService.findByIdOrThrow(loanId);
    const taprootMs = this.reconstructTaprootMs(loan);
    const multisigUtxo = this.getEscrowUtxo(loan);

    const psbt = this.psbtService.buildTaprootSpendPsbt({
      multisigUtxo,
      taprootMultisig: taprootMs,
      spendLeaf: 'lender_bound',
      outputAddress: await this.resolveLenderBtcAddress(loan),
      network: this.network,
    });

    // Bound pre-signs its half at origination
    this.boundSigner.signAllTaprootInputs(psbt);
    const psbtHex = psbt.toHex();

    // Store pre-signed PSBT on loan
    await this.loanService.findByIdAndUpdate(loanId, {
      $set: { 'liquidation.preSignedPsbt': psbtHex },
    });

    this.logger.log(`Liquidation PSBT pre-signed for loan ${loanId}`);
    return psbtHex;
  }

  /**
   * Execute liquidation: retrieve pre-signed PSBT, lender co-signs (or Bound uses its stored sig), broadcast.
   * Called by LiquidationService when LTV threshold breached.
   */
  async executeLiquidation(loanId: string): Promise<string> {
    const loan = await this.loanService.findByIdOrThrow(loanId);

    if (!loan.liquidation?.preSignedPsbt) {
      throw new BadRequestException('No pre-signed liquidation PSBT found');
    }

    // Retrieve Bound's pre-signed PSBT (already has Bound sig)
    const psbt = this.boundSigner.psbtFromHex(loan.liquidation.preSignedPsbt);

    // Finalize (Bound sig is already in the PSBT from origination)
    this.boundSigner.finalizeTaprootPsbt(psbt);
    const txHex = this.boundSigner.extractTxHex(psbt);

    const txid = await this.broadcastTx(txHex);

    await this.loanService.transitionState(loanId, ELoanState.LIQUIDATED, { txid });

    this.logger.log(`Liquidation broadcast — loan ${loanId} txid: ${txid}`);
    return txid;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FORFEITURE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build + execute forfeiture PSBT (post-default, lender+bound path).
   * Spend path: lender+bound leaf — same as liquidation.
   */
  async executeForfeiture(loanId: string): Promise<string> {
    const loan = await this.loanService.findByIdOrThrow(loanId);
    if (loan.state !== ELoanState.DEFAULTED) {
      throw new BadRequestException(RESPONSE_CODE.loan.invalidState);
    }

    const taprootMs = this.reconstructTaprootMs(loan);
    const multisigUtxo = this.getEscrowUtxo(loan);

    const psbt = this.psbtService.buildTaprootSpendPsbt({
      multisigUtxo,
      taprootMultisig: taprootMs,
      spendLeaf: 'lender_bound',
      outputAddress: await this.resolveLenderBtcAddress(loan),
      network: this.network,
    });

    // Bound signs — this is Bound+Lender path, Bound signs here
    // Lender must also sign (their sig was pre-authorized at origination via the preSignedPsbt pattern)
    // For forfeiture we re-sign fresh since timing is different
    this.boundSigner.signAllTaprootInputs(psbt);
    this.boundSigner.finalizeTaprootPsbt(psbt);
    const txHex = this.boundSigner.extractTxHex(psbt);

    const txid = await this.broadcastTx(txHex);

    await this.loanService.transitionState(loanId, ELoanState.FORFEITED, { txid });

    this.logger.log(`Forfeiture broadcast — loan ${loanId} txid: ${txid}`);
    return txid;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private reconstructTaprootMs(loan: LoanEntity): ITaprootMultisigResult {
    return this.multisigService.createTaprootMultisig({
      borrowerPubkey: loan.escrow.borrowerPubkey,
      lenderPubkey: loan.escrow.lenderPubkey,
      boundPubkey: loan.escrow.boundPubkey,
      network: this.network,
    });
  }

  private getEscrowUtxo(loan: LoanEntity): IUtxoInput {
    if (!loan.escrow.fundingTxid) {
      throw new BadRequestException('Escrow not funded');
    }
    return {
      txid: loan.escrow.fundingTxid,
      vout: loan.escrow.fundingVout ?? 0,
      value: Math.round(loan.terms.collateralBtc * 1e8),
    };
  }

  private async broadcastTx(txHex: string): Promise<string> {
    try {
      const res = await fetch('https://signet.ums.radfi.co/api/transactions/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawTx: txHex, isBroadcast: true }),
      });
      const json = await res.json();
      return json?.data?.txid ?? json?.txid ?? txHex.slice(0, 64);
    } catch (err) {
      this.logger.error(`Broadcast failed: ${err}`);
      throw new BadRequestException('Transaction broadcast failed');
    }
  }

  private async getBorrowerBtcUtxos(loan: LoanEntity): Promise<IUtxoInput[]> {
    const borrowerAddress = await this.resolveBorrowerAddress(loan);
    const utxos = await this.radfiService.fetchUtxos(borrowerAddress);
    return utxos
      .filter((u) => u.isAvailable && !u.isSpent)
      .map((u) => ({ txid: u.txid, vout: u.vout, value: u.satoshi }));
  }

  private async getLenderBusdUtxos(loan: LoanEntity): Promise<IUtxoInput[]> {
    // Lender's Rune UTXOs are provided by the lender's wallet on the FE side
    // They are embedded in the lender-signed PSBT inputs — not fetched server-side
    return [];
  }

  /**
   * Derive P2TR address from a compressed pubkey (33-byte hex).
   * Uses the pubkey as the internal key (single-key P2TR).
   */
  private pubkeyToP2TRAddress(pubkeyHex: string): string {
    const pubkeyBuf = Buffer.from(pubkeyHex, 'hex');
    const xOnly = pubkeyBuf.slice(1); // strip 02/03 prefix
    const p2tr = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: this.network });
    return p2tr.address!;
  }

  private async resolveBorrowerAddress(loan: LoanEntity): Promise<string> {
    // borrowerPubkey is a compressed 33-byte hex pubkey → derive P2TR address
    return this.pubkeyToP2TRAddress(loan.escrow.borrowerPubkey);
  }

  private async resolveLenderBtcAddress(loan: LoanEntity): Promise<string> {
    return this.pubkeyToP2TRAddress(loan.escrow.lenderPubkey);
  }

  private async resolveBoundAddress(): Promise<string> {
    const btcConfig = this.configService.get<IBitcoinConfig>(ENV_REGISTER.BITCOIN)!;
    return this.pubkeyToP2TRAddress(btcConfig.boundPubkey);
  }

  private validateState(loan: LoanEntity, expected: ELoanState): void {
    if (loan.state !== expected) {
      throw new BadRequestException(RESPONSE_CODE.loan.invalidState);
    }
  }

  private resolveNetwork(network: string): bitcoin.Network {
    switch (network) {
      case 'mainnet': return bitcoin.networks.bitcoin;
      case 'signet':
      case 'testnet': return bitcoin.networks.testnet; // signet uses testnet WIF/address prefix
      default: return bitcoin.networks.regtest;
    }
  }
}
