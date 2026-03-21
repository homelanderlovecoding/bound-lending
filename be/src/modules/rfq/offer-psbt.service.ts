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
  }): Promise<string> {
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

    // Loan amounts in sats (bUSD uses 2 decimal places: 1 bUSD = 100 sats)
    const loanAmountSats = Math.round(amountUsd * 100);
    const feeSats = Math.round((amountUsd * originationFeePct) / 100 * 100);

    const psbt = new bitcoin.Psbt({ network });

    // Add lender UTXOs as inputs
    for (const utxo of lenderUtxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: lenderScript,
          value: utxo.valueSats,
        },
      });
    }

    // Output 0: loan amount → multisig P2TR
    psbt.addOutput({
      address: multisigResult.address,
      value: loanAmountSats,
    });

    // Output 1: origination fee → Bound P2TR
    psbt.addOutput({
      address: boundAddress,
      value: feeSats,
    });

    return psbt.toHex();
  }
}
