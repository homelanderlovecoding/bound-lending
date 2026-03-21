import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ENV_REGISTER } from '../../commons/constants';
import { IBitcoinConfig } from '../../commons/types';
import { MultisigService } from '../escrow';

/**
 * Builds unsigned lender commitment PSBTs for RFQ offers.
 * Isolated from LoanModule to avoid circular dependency.
 */
@Injectable()
export class OfferPsbtService {
  constructor(
    private readonly multisigService: MultisigService,
    private readonly configService: ConfigService,
  ) {
    bitcoin.initEccLib(ecc);
  }

  /**
   * Build an unsigned PSBT representing the lender's funding commitment.
   * Inputs: lender UTXOs
   * Output 0: loanAmountSats → 3-party P2TR multisig address
   * Output 1: feeSats → Bound P2TR address
   */
  async buildLenderOfferPsbt(params: {
    borrowerPubkey: string;
    lenderPubkey: string;
    lenderUtxos: { txid: string; vout: number; valueSats: number }[];
    amountUsd: number;
    originationFeePct: number;
    network: bitcoin.Network;
  }): Promise<string | null> {
    // Can't build a valid PSBT with no inputs — return null, caller handles gracefully
    if (!params.lenderUtxos || params.lenderUtxos.length === 0) return null;
    const { borrowerPubkey, lenderPubkey, lenderUtxos, amountUsd, originationFeePct, network } =
      params;

    const btcConfig = this.configService.get<IBitcoinConfig>(ENV_REGISTER.BITCOIN)!;
    const boundPubkey = btcConfig.boundPubkey;

    // Build P2TR taproot 3-party multisig address (borrower + lender + bound)
    const multisigResult = this.multisigService.createTaprootMultisig({
      borrowerPubkey,
      lenderPubkey,
      boundPubkey,
      network,
    });

    // Derive lender P2TR address from lenderPubkey
    const lenderPubkeyBuf = Buffer.from(lenderPubkey, 'hex');
    const lenderXOnly = lenderPubkeyBuf.slice(1); // drop parity byte
    const lenderP2tr = bitcoin.payments.p2tr({ internalPubkey: lenderXOnly, network });
    const lenderScript = lenderP2tr.output!;

    // Derive Bound P2TR address from boundPubkey
    const boundPubkeyBuf = Buffer.from(boundPubkey, 'hex');
    const boundXOnly = boundPubkeyBuf.slice(1);
    const boundP2tr = bitcoin.payments.p2tr({ internalPubkey: boundXOnly, network });
    const boundAddress = boundP2tr.address!;

    // For Rune-based lending, loanAmountSats represents bUSD Rune value in sats.
    // On signet MVP without real Runes, we use a nominal commitment output (546 = dust limit)
    // so the PSBT is valid and wallet can sign. The real amount is tracked off-chain.
    const ESTIMATED_FEE_SATS = 2000;
    const totalInputSats = lenderUtxos.reduce((sum, u) => sum + u.valueSats, 0);
    const commitmentSats = 546; // nominal output to multisig (Rune transfer placeholder)
    const feeSats = 546;         // nominal fee output to Bound
    const changeSats = totalInputSats - commitmentSats - feeSats - ESTIMATED_FEE_SATS;

    if (changeSats < 0) {
      return null; // insufficient funds for even a nominal commitment
    }

    const psbt = new bitcoin.Psbt({ network });

    // Add lender UTXOs as inputs (P2TR key-path spend)
    for (const utxo of lenderUtxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: lenderScript,
          value: utxo.valueSats,
        },
        tapInternalKey: lenderXOnly, // required for UniSat to sign P2TR inputs
      });
    }

    // Output 0: commitment → multisig P2TR (Rune transfer placeholder)
    psbt.addOutput({
      address: multisigResult.address,
      value: commitmentSats,
    });

    // Output 1: origination fee → Bound P2TR
    psbt.addOutput({
      address: boundAddress,
      value: feeSats,
    });

    // Output 2: change back to lender
    if (changeSats >= 546) {
      psbt.addOutput({
        address: lenderP2tr.address!,
        value: changeSats,
      });
    }

    return psbt.toHex();
  }
}
