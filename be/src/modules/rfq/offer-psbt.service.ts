import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ENV_REGISTER } from '../../commons/constants';
import { IBitcoinConfig, ILendingConfig } from '../../commons/types';
import { MultisigService, RuneService } from '../escrow';
import { MetadataService } from '../escrow/metadata.service';
import { UnisatService } from '../unisat/unisat.service';
import { UserService } from '../user/user.service';

// P2TR input ~58 vBytes, P2TR output ~43 vBytes, overhead ~10 vBytes
const P2TR_INPUT_VBYTES = 58;
const P2TR_OUTPUT_VBYTES = 43;
const TX_OVERHEAD_VBYTES = 10;
const OP_RETURN_VBYTES = 40; // Runestone OP_RETURN ~20-40 vBytes



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
    private readonly runeService: RuneService,
    private readonly metadataService: MetadataService,
    private readonly unisatService: UnisatService,
    private readonly userService: UserService,
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
      throw new BadRequestException('Borrower has not connected their wallet yet — pubkey required for PSBT');
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
      throw new BadRequestException(`Lender has no bUSD Rune UTXOs at ${lenderAddress}. You need bUSD to make an offer.`);
    }

    // 4. Fetch borrower BTC UTXOs
    const borrowerBtcUtxos = await this.unisatService.fetchBtcUtxos(borrowerAddress);
    if (!borrowerBtcUtxos.length) {
      throw new BadRequestException(`Borrower has no BTC UTXOs at ${borrowerAddress}. They need BTC collateral to create a valid loan.`);
    }

    // 5. Get dynamic fee rate from UniSat
    const feeRates = await this.unisatService.getRecommendedFees();
    const feeRateSatPerVb = Math.max(feeRates.halfHourFee, 1); // use halfHour, min 1

    // Estimate tx size: inputs + outputs + overhead
    const estimatedInputs = lenderRuneUtxos.length + borrowerBtcUtxos.length;
    const estimatedOutputs = 5; // borrower Rune + multisig + OP_RETURN + lender change + borrower BTC change
    const estimatedVbytes = TX_OVERHEAD_VBYTES
      + (estimatedInputs * P2TR_INPUT_VBYTES)
      + (estimatedOutputs * P2TR_OUTPUT_VBYTES)
      + OP_RETURN_VBYTES;
    const estimatedFeeSats = estimatedVbytes * feeRateSatPerVb;

    this.logger.log(`Fee estimate: ${estimatedVbytes} vB × ${feeRateSatPerVb} sat/vB = ${estimatedFeeSats} sats`);

    // 6. Calculate amounts
    const collateralSats = Math.round(collateralBtc * 1e8);

    // Select borrower UTXOs to cover collateral + fee
    const { selected: selectedBorrowerUtxos, totalSats: borrowerTotalSats } =
      this.selectUtxos(borrowerBtcUtxos.map(u => ({ ...u, valueSats: u.satoshi })), collateralSats + estimatedFeeSats);

    if (borrowerTotalSats < collateralSats + estimatedFeeSats) {
      throw new BadRequestException(`Borrower has insufficient BTC: ${(borrowerTotalSats / 1e8).toFixed(8)} BTC < ${((collateralSats + estimatedFeeSats) / 1e8).toFixed(8)} BTC needed`);
    }

    const borrowerChangeSats = borrowerTotalSats - collateralSats - estimatedFeeSats;

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
    // Layout:
    //   [0] bUSD → Borrower       (loan disbursement, Rune via Runestone edict)
    //   [1] BTC  → Multisig P2TR  (collateral locked)
    //   [2] OP_RETURN Runestone    (Rune edict + change pointer)
    //   [3] bUSD change → Lender  (Rune change via Runestone pointer)
    //   [4] BTC change → Borrower (if any)

    const loanAmountRune = this.runeService.toBusdSmallestUnit(amountUsd);

    // Output 0: bUSD → Borrower (546 sats dust carrier for Rune)
    psbt.addOutput({
      address: borrowerAddress,
      value: 546,
    });

    // Output 1: BTC → P2TR multisig (collateral)
    psbt.addOutput({
      address: multisigResult.address,
      value: collateralSats,
    });

    // Calculate total lender bUSD to determine if Rune change output is needed
    const totalLenderRuneAmount = lenderRuneUtxos.reduce(
      (sum, u) => sum + BigInt(u.runeAmount || '0'), 0n,
    );
    const needsRuneChange = totalLenderRuneAmount > loanAmountRune;
    const lenderTotalSats = lenderRuneUtxos.reduce((s, u) => s + u.satoshi, 0);

    // Track the next output index for dynamic layout
    let nextIdx = 2; // 0=borrower bUSD, 1=multisig BTC

    // Output 2: OP_RETURN Runestone
    const runeChangeOutputIdx = needsRuneChange ? nextIdx + 2 : 0; // point to lender change, or back to borrower if no change
    const runestoneScript = this.runeService.buildBusdRunestone(
      [{ outputIndex: 0, amount: loanAmountRune }],
      runeChangeOutputIdx,
    );
    psbt.addOutput({ script: runestoneScript, value: 0 });
    nextIdx++;

    // Output 3: OP_RETURN loan metadata (BNDL + CBOR)
    const metadata = this.metadataService.encodeMetadata({
      type: 'origination',
      loanId: rfqId,
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
    nextIdx++;

    // Output 4 (optional): bUSD Rune change → Lender
    if (needsRuneChange) {
      const lenderChangeSats = lenderTotalSats - 546; // minus borrower output carrier
      psbt.addOutput({
        address: lenderAddress,
        value: lenderChangeSats >= 546 ? lenderChangeSats : 546,
      });
      nextIdx++;
    }

    // Output N: BTC change → Borrower (if above dust)
    if (borrowerChangeSats >= 546) {
      psbt.addOutput({
        address: borrowerAddress,
        value: borrowerChangeSats,
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
