import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ENV_REGISTER } from '../../commons/constants';
import { IBitcoinConfig, ILendingConfig } from '../../commons/types';
import { MultisigService } from '../escrow';
import { UnisatService } from '../unisat/unisat.service';
import { UserService } from '../user/user.service';
import { MetadataService } from '../escrow/metadata.service';

const ESTIMATED_FEE_SATS = 2000;

/**
 * Builds the complete origination PSBT at offer time.
 *
 * Inputs:
 *   [0..n] Lender bUSD Rune UTXOs   — lender signs at offer time
 *   [n..m] Borrower BTC UTXOs       — borrower signs at accept time
 *
 * Outputs:
 *   [0] bUSD → Borrower address     (loan disbursement, carries Rune via Runestone)
 *   [1] BTC  → P2TR multisig        (collateral locked)
 *   [2] bUSD → Bound address        (origination fee, carries Rune via Runestone)
 *   [3] OP_RETURN Runestone          (Rune transfer instructions)
 *   [4] BTC change → Borrower       (if any)
 *   [5] bUSD change → Lender        (if any)
 */
@Injectable()
export class OfferPsbtService {
  private readonly logger = new Logger(OfferPsbtService.name);
  private readonly network: bitcoin.Network;
  private readonly btcConfig: IBitcoinConfig;
  private readonly lendingConfig: ILendingConfig;

  constructor(
    private readonly multisigService: MultisigService,
    private readonly unisatService: UnisatService,
    private readonly userService: UserService,
    private readonly metadataService: MetadataService,
    private readonly configService: ConfigService,
  ) {
    bitcoin.initEccLib(ecc);
    this.btcConfig = this.configService.get<IBitcoinConfig>(ENV_REGISTER.BITCOIN)!;
    this.lendingConfig = this.configService.get<ILendingConfig>(ENV_REGISTER.LENDING)!;
    this.network = this.resolveNetwork(this.btcConfig.network);
  }

  /**
   * Build complete origination PSBT for lender to sign.
   * Returns PSBT hex + metadata for storage.
   */
  async buildOriginationPsbt(params: {
    rfqId: string;
    borrowerId: string;
    lenderPubkey: string;
    collateralBtc: number;
    amountUsd: number;
    termDays: number;
    rateApr: number;
  }): Promise<{ psbtHex: string; lenderInputCount: number; borrowerInputCount: number } | null> {
    const { rfqId, borrowerId, lenderPubkey, collateralBtc, amountUsd, termDays, rateApr } = params;
    const boundPubkey = this.btcConfig.boundPubkey;
    const originationFeePct = this.lendingConfig.originationFeePct;

    // 1. Get borrower record + pubkey
    const borrower = await this.userService.findById(borrowerId);
    if (!borrower?.pubkey) {
      this.logger.warn(`Borrower ${borrowerId} has no pubkey — cannot build PSBT`);
      return null;
    }
    const borrowerPubkey = borrower.pubkey;
    const borrowerAddress = this.pubkeyToP2TRAddress(borrowerPubkey);
    const lenderAddress = this.pubkeyToP2TRAddress(lenderPubkey);
    const boundAddress = this.pubkeyToP2TRAddress(boundPubkey);

    // 2. Build P2TR multisig address
    const multisigResult = this.multisigService.createTaprootMultisig({
      borrowerPubkey,
      lenderPubkey,
      boundPubkey,
      network: this.network,
    });

    // 3. Fetch lender bUSD Rune UTXOs
    const lenderRuneUtxos = await this.unisatService.fetchRuneUtxos(lenderAddress);
    if (!lenderRuneUtxos.length) {
      this.logger.warn(`Lender ${lenderAddress} has no bUSD Rune UTXOs`);
      return null;
    }

    // 4. Fetch borrower BTC UTXOs
    const borrowerBtcUtxos = await this.unisatService.fetchBtcUtxos(borrowerAddress);
    if (!borrowerBtcUtxos.length) {
      this.logger.warn(`Borrower ${borrowerAddress} has no BTC UTXOs`);
      return null;
    }

    // 5. Calculate amounts
    const collateralSats = Math.round(collateralBtc * 1e8);
    const feeUsd = amountUsd * (originationFeePct / 100);

    // Select borrower UTXOs to cover collateral + fee
    const { selected: selectedBorrowerUtxos, totalSats: borrowerTotalSats } =
      this.selectUtxos(borrowerBtcUtxos.map(u => ({ ...u, valueSats: u.satoshi })), collateralSats + ESTIMATED_FEE_SATS);

    if (borrowerTotalSats < collateralSats + ESTIMATED_FEE_SATS) {
      this.logger.warn(`Borrower has insufficient BTC: ${borrowerTotalSats} sats < ${collateralSats + ESTIMATED_FEE_SATS} needed`);
      return null;
    }

    const borrowerChangeSats = borrowerTotalSats - collateralSats - ESTIMATED_FEE_SATS;

    // 6. Build PSBT
    const psbt = new bitcoin.Psbt({ network: this.network });

    // -- Lender inputs (bUSD Rune UTXOs) --
    const lenderXOnly = Buffer.from(lenderPubkey, 'hex').slice(1);
    const lenderScript = bitcoin.payments.p2tr({ internalPubkey: lenderXOnly, network: this.network }).output!;

    for (const utxo of lenderRuneUtxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: lenderScript,
          value: utxo.satoshi,
        },
        tapInternalKey: lenderXOnly,
      });
    }
    const lenderInputCount = lenderRuneUtxos.length;

    // -- Borrower inputs (BTC UTXOs) --
    const borrowerXOnly = Buffer.from(borrowerPubkey, 'hex').slice(1);
    const borrowerScript = bitcoin.payments.p2tr({ internalPubkey: borrowerXOnly, network: this.network }).output!;

    for (const utxo of selectedBorrowerUtxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: borrowerScript,
          value: utxo.valueSats,
        },
        tapInternalKey: borrowerXOnly,
      });
    }
    const borrowerInputCount = selectedBorrowerUtxos.length;

    // -- Outputs --

    // Output 0: bUSD → Borrower (loan disbursement — Rune carried via Runestone)
    // Rune outputs use 546 sats (dust) as the BTC carrier
    psbt.addOutput({
      address: borrowerAddress,
      value: 546,
    });

    // Output 1: BTC → P2TR multisig (collateral locked)
    psbt.addOutput({
      address: multisigResult.address,
      value: collateralSats,
    });

    // Output 2: bUSD → Bound (origination fee — Rune carried via Runestone)
    psbt.addOutput({
      address: boundAddress,
      value: 546,
    });

    // Output 3: OP_RETURN Runestone (Rune transfer instructions)
    const metadata = this.metadataService.encodeMetadata({
      type: 'origination',
      loanId: rfqId, // use rfqId at offer time, updated to loanId at accept
      amountUsd,
      collateralBtc,
      rateApr,
      originationDate: new Date().toISOString().split('T')[0],
      repaymentDate: new Date(Date.now() + termDays * 86400000).toISOString().split('T')[0],
      lenderId: 'pending',
      borrowerId,
    });
    psbt.addOutput({
      script: bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, metadata]),
      value: 0,
    });

    // Output 4: BTC change → Borrower (if above dust)
    if (borrowerChangeSats >= 546) {
      psbt.addOutput({
        address: borrowerAddress,
        value: borrowerChangeSats,
      });
    }

    // Output 5: bUSD Rune change → Lender (dust carrier for remaining Runes)
    const lenderTotalSats = lenderRuneUtxos.reduce((s, u) => s + u.satoshi, 0);
    const lenderChangeSats = lenderTotalSats - 546 - 546; // minus borrower output + fee output carriers
    if (lenderChangeSats >= 546) {
      psbt.addOutput({
        address: lenderAddress,
        value: lenderChangeSats,
      });
    }

    const psbtHex = psbt.toHex();
    this.logger.log(`Built origination PSBT for RFQ ${rfqId}: ${lenderInputCount} lender inputs, ${borrowerInputCount} borrower inputs, ${psbt.txOutputs.length} outputs`);

    return { psbtHex, lenderInputCount, borrowerInputCount };
  }

  /**
   * Select UTXOs to cover a target amount (simple greedy).
   */
  private selectUtxos(
    utxos: { txid: string; vout: number; valueSats: number }[],
    targetSats: number,
  ): { selected: { txid: string; vout: number; valueSats: number }[]; totalSats: number } {
    const sorted = [...utxos].sort((a, b) => b.valueSats - a.valueSats);
    const selected: typeof utxos = [];
    let total = 0;
    for (const u of sorted) {
      selected.push(u);
      total += u.valueSats;
      if (total >= targetSats) break;
    }
    return { selected, totalSats: total };
  }

  private pubkeyToP2TRAddress(pubkeyHex: string): string {
    const pubkeyBuf = Buffer.from(pubkeyHex, 'hex');
    const xOnly = pubkeyBuf.slice(1);
    const p2tr = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: this.network });
    return p2tr.address!;
  }

  private resolveNetwork(network: string): bitcoin.Network {
    switch (network) {
      case 'mainnet': return bitcoin.networks.bitcoin;
      case 'signet':
      case 'testnet': return bitcoin.networks.testnet;
      default: return bitcoin.networks.regtest;
    }
  }
}
