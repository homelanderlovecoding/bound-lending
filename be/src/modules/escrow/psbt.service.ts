import { Injectable, BadRequestException } from '@nestjs/common';
import * as bitcoin from 'bitcoinjs-lib';
import { RESPONSE_CODE } from '../../commons/constants';
import {
  IOriginationPsbtParams,
  IRepaymentPsbtParams,
  ILiquidationPsbtParams,
  IForfeiturePsbtParams,
  IUtxoInput,
} from './escrow.type';

const ESTIMATED_FEE_SATS = 2000;

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
    this.addMultisigInputs(psbt, params.borrowerBtcUtxos, params.redeemScript, network);

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
}
