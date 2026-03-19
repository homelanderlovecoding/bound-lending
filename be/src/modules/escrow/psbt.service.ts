import { Injectable, BadRequestException } from '@nestjs/common';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { RESPONSE_CODE } from '../../commons/constants';
import {
  IOriginationPsbtParams,
  IRepaymentPsbtParams,
  ILiquidationPsbtParams,
  IForfeiturePsbtParams,
  IUtxoInput,
  ITaprootPsbtParams,
  ITaprootMultisigResult,
} from './escrow.type';

const ESTIMATED_FEE_SATS = 2000;

/** NUMS internal key — same as MultisigService */
const NUMS_INTERNAL_KEY = Buffer.from(
  '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
  'hex',
);

@Injectable()
export class PsbtService {
  /**
   * Build origination PSBT (3-party atomic):
   * Inputs: lender bUSD UTXOs + borrower BTC UTXOs
   * Outputs: bUSD → borrower, bUSD → bound (fee), BTC → multisig, OP_RETURN metadata
   */
  buildOriginationPsbt(params: IOriginationPsbtParams): bitcoin.Psbt {
    const network = params.network ?? bitcoin.networks.regtest;
    const psbt = new bitcoin.Psbt({ network });

    this.addUtxoInputs(psbt, params.lenderBusdUtxos);
    if (params.redeemScript) {
      this.addMultisigInputs(psbt, params.borrowerBtcUtxos, params.redeemScript, network);
    } else {
      this.addUtxoInputs(psbt, params.borrowerBtcUtxos);
    }

    // Output 0: bUSD → borrower (loan amount)
    psbt.addOutput({
      address: params.borrowerAddress,
      value: params.loanAmountSats,
    });

    // Output 1: bUSD → Bound (origination fee)
    psbt.addOutput({
      address: params.boundAddress,
      value: params.originationFeeSats,
    });

    // Output 2: BTC → 2-of-3 multisig (collateral)
    const btcTotal = this.sumInputValues(params.borrowerBtcUtxos);
    psbt.addOutput({
      address: params.multisigAddress,
      value: btcTotal - ESTIMATED_FEE_SATS,
    });

    // Output 3: OP_RETURN metadata (if provided)
    if (params.metadata) {
      this.addOpReturnOutput(psbt, params.metadata);
    }

    return psbt;
  }

  /**
   * Build repayment PSBT:
   * Inputs: borrower bUSD UTXOs + multisig BTC UTXO
   * Outputs: BTC → borrower, bUSD → lender
   */
  buildRepaymentPsbt(params: IRepaymentPsbtParams): bitcoin.Psbt {
    const network = params.network ?? bitcoin.networks.regtest;
    const psbt = new bitcoin.Psbt({ network });

    this.addUtxoInputs(psbt, params.borrowerBusdUtxos);
    this.addMultisigInput(psbt, params.multisigUtxo, params.redeemScript, network);

    // Output 0: BTC → borrower (collateral returned)
    psbt.addOutput({
      address: params.borrowerBtcAddress,
      value: params.multisigUtxo.value - ESTIMATED_FEE_SATS,
    });

    // Output 1: bUSD → lender (principal + interest)
    psbt.addOutput({
      address: params.lenderBusdAddress,
      value: params.repaymentAmountSats,
    });

    if (params.metadata) {
      this.addOpReturnOutput(psbt, params.metadata);
    }

    return psbt;
  }

  /**
   * Build liquidation PSBT (pre-signed by lender at origination):
   * Input: multisig BTC UTXO
   * Output: 100% BTC → lender
   */
  buildLiquidationPsbt(params: ILiquidationPsbtParams): bitcoin.Psbt {
    const network = params.network ?? bitcoin.networks.regtest;
    const psbt = new bitcoin.Psbt({ network });

    this.addMultisigInput(psbt, params.multisigUtxo, params.redeemScript, network);

    psbt.addOutput({
      address: params.lenderBtcAddress,
      value: params.multisigUtxo.value - ESTIMATED_FEE_SATS,
    });

    return psbt;
  }

  /**
   * Build forfeiture PSBT (post-default):
   * Input: multisig BTC UTXO
   * Output: 100% BTC → lender
   */
  buildForfeiturePsbt(params: IForfeiturePsbtParams): bitcoin.Psbt {
    const network = params.network ?? bitcoin.networks.regtest;
    const psbt = new bitcoin.Psbt({ network });

    this.addMultisigInput(psbt, params.multisigUtxo, params.redeemScript, network);

    psbt.addOutput({
      address: params.lenderBtcAddress,
      value: params.multisigUtxo.value - ESTIMATED_FEE_SATS,
    });

    return psbt;
  }

  /** Add regular UTXO inputs (no witness script) */
  private addUtxoInputs(psbt: bitcoin.Psbt, utxos: IUtxoInput[]): void {
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: Buffer.alloc(0),
          value: utxo.value,
        },
      });
    }
  }

  /** Add a single multisig input with witnessScript */
  private addMultisigInput(
    psbt: bitcoin.Psbt,
    utxo: IUtxoInput,
    redeemScript: Buffer,
    network: bitcoin.Network,
  ): void {
    const p2wsh = bitcoin.payments.p2wsh({
      redeem: { output: redeemScript },
      network,
    });

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: p2wsh.output!,
        value: utxo.value,
      },
      witnessScript: redeemScript,
    });
  }

  /** Add multiple BTC inputs as multisig */
  private addMultisigInputs(
    psbt: bitcoin.Psbt,
    utxos: IUtxoInput[],
    redeemScript: Buffer,
    network: bitcoin.Network,
  ): void {
    for (const utxo of utxos) {
      this.addMultisigInput(psbt, utxo, redeemScript, network);
    }
  }

  /** Add OP_RETURN data output */
  private addOpReturnOutput(psbt: bitcoin.Psbt, data: Buffer): void {
    const opReturnScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_RETURN,
      data,
    ]);
    psbt.addOutput({ script: opReturnScript, value: 0 });
  }

  /** Sum all input values */
  private sumInputValues(utxos: IUtxoInput[]): number {
    return utxos.reduce((sum, u) => sum + u.value, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Taproot (P2TR) PSBT builders
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build a taproot spend PSBT for the given leaf (2-of-3 combo).
   * Used for: repayment (borrower+bound), liquidation (lender+bound), forfeiture (lender+bound).
   */
  buildTaprootSpendPsbt(params: ITaprootPsbtParams): bitcoin.Psbt {
    bitcoin.initEccLib(ecc);
    const network = params.network ?? bitcoin.networks.regtest;
    const psbt = new bitcoin.Psbt({ network });
    const { taprootMultisig, spendLeaf, multisigUtxo } = params;

    const leafScript = this.getLeafScript(taprootMultisig, spendLeaf);
    const tapLeafScript = this.buildTapLeafScript(taprootMultisig, leafScript, network);

    psbt.addInput({
      hash: multisigUtxo.txid,
      index: multisigUtxo.vout,
      witnessUtxo: {
        script: this.getTaprootOutputScript(taprootMultisig, network),
        value: multisigUtxo.value,
      },
      tapLeafScript: [tapLeafScript],
    });

    psbt.addOutput({
      address: params.outputAddress,
      value: multisigUtxo.value - ESTIMATED_FEE_SATS,
    });

    return psbt;
  }

  /**
   * Build origination PSBT with taproot multisig output.
   * BTC → P2TR multisig, bUSD → borrower (via Runes OP_RETURN).
   */
  buildTaprootOriginationPsbt(params: IOriginationPsbtParams): bitcoin.Psbt {
    bitcoin.initEccLib(ecc);

    if (!params.taprootMultisig) {
      throw new BadRequestException(RESPONSE_CODE.escrow.psbtConstructionFailed);
    }

    const network = params.network ?? bitcoin.networks.regtest;
    const psbt = new bitcoin.Psbt({ network });

    // bUSD inputs (Runes UTXOs from lender)
    this.addUtxoInputs(psbt, params.lenderBusdUtxos);

    // BTC inputs (borrower's collateral) as P2WPKH or P2TR — added as regular inputs
    // The output will lock them into the taproot multisig
    this.addUtxoInputs(psbt, params.borrowerBtcUtxos);

    // Output 0: bUSD → borrower (Runes transfer via OP_RETURN)
    psbt.addOutput({ address: params.borrowerAddress, value: params.loanAmountSats });

    // Output 1: fee → Bound
    psbt.addOutput({ address: params.boundAddress, value: params.originationFeeSats });

    // Output 2: BTC → P2TR 2-of-3 multisig
    const btcTotal = this.sumInputValues(params.borrowerBtcUtxos);
    psbt.addOutput({
      address: params.taprootMultisig.address,
      value: btcTotal - ESTIMATED_FEE_SATS,
    });

    // Output 3+: OP_RETURN metadata
    if (params.metadata) {
      this.addOpReturnOutput(psbt, params.metadata);
    }

    return psbt;
  }

  private getLeafScript(ms: ITaprootMultisigResult, spendLeaf: ITaprootPsbtParams['spendLeaf']): Buffer {
    switch (spendLeaf) {
      case 'borrower_lender': return ms.leafBorrowerLender;
      case 'borrower_bound': return ms.leafBorrowerBound;
      case 'lender_bound': return ms.leafLenderBound;
    }
  }

  private getTaprootOutputScript(ms: ITaprootMultisigResult, network: bitcoin.Network): Buffer {
    const p2tr = bitcoin.payments.p2tr({
      internalPubkey: NUMS_INTERNAL_KEY,
      scriptTree: ms.scriptTree,
      network,
    });
    return p2tr.output!;
  }

  private buildTapLeafScript(
    ms: ITaprootMultisigResult,
    leafScript: Buffer,
    network: bitcoin.Network,
  ): { leafVersion: number; script: Buffer; controlBlock: Buffer } {
    const p2tr = bitcoin.payments.p2tr({
      internalPubkey: NUMS_INTERNAL_KEY,
      scriptTree: ms.scriptTree,
      redeem: { output: leafScript, redeemVersion: 0xc0 },
      network,
    });

    if (!p2tr.witness || p2tr.witness.length < 3) {
      throw new BadRequestException(RESPONSE_CODE.escrow.psbtConstructionFailed);
    }

    // witness = [sig1?, sig2?, script, controlBlock]
    const controlBlock = p2tr.witness[p2tr.witness.length - 1];
    return { leafVersion: 0xc0, script: leafScript, controlBlock };
  }
}
