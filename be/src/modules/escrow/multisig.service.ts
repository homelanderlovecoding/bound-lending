import { Injectable, BadRequestException } from '@nestjs/common';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { RESPONSE_CODE } from '../../commons/constants';
import { Taptree } from 'bitcoinjs-lib/src/types';
import { IMultisigParams, IMultisigResult, ITaprootMultisigParams, ITaprootMultisigResult } from './escrow.type';

/**
 * NUMS point — provably unspendable internal key.
 * Nothing-Up-My-Sleeve: hash of "BoundLending" — no discrete log known.
 * Forces all spends through script path only.
 */
const NUMS_INTERNAL_KEY = Buffer.from(
  '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
  'hex',
);

@Injectable()
export class MultisigService {
  /**
   * Create a 2-of-3 P2WSH multisig address.
   * OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG
   *
   * Pubkeys are sorted lexicographically for deterministic addresses.
   */
  createMultisigAddress(params: IMultisigParams): IMultisigResult {
    const { borrowerPubkey, lenderPubkey, boundPubkey } = params;
    const network = params.network ?? bitcoin.networks.regtest;

    const pubkeys = [borrowerPubkey, lenderPubkey, boundPubkey].map((hex) =>
      this.validateAndParsePubkey(hex),
    );

    // Sort lexicographically for deterministic multisig
    const sortedPubkeys = pubkeys.sort((a, b) => a.compare(b));

    const redeemScript = this.buildRedeemScript(sortedPubkeys);
    const address = this.deriveP2wshAddress(redeemScript, network);

    return {
      address,
      redeemScript,
      redeemScriptHex: redeemScript.toString('hex'),
    };
  }

  /** Validate a hex pubkey is 33 bytes (compressed) */
  private validateAndParsePubkey(hex: string): Buffer {
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 33) {
      throw new BadRequestException(RESPONSE_CODE.escrow.invalidPubkey);
    }
    if (buf[0] !== 0x02 && buf[0] !== 0x03) {
      throw new BadRequestException(RESPONSE_CODE.escrow.invalidPubkey);
    }
    return buf;
  }

  /** Build OP_2 <pk1> <pk2> <pk3> OP_3 OP_CHECKMULTISIG */
  private buildRedeemScript(sortedPubkeys: Buffer[]): Buffer {
    return bitcoin.script.compile([
      bitcoin.opcodes.OP_2,
      sortedPubkeys[0],
      sortedPubkeys[1],
      sortedPubkeys[2],
      bitcoin.opcodes.OP_3,
      bitcoin.opcodes.OP_CHECKMULTISIG,
    ]);
  }

  /** Wrap redeemScript in P2WSH to get the address */
  private deriveP2wshAddress(redeemScript: Buffer, network: bitcoin.Network): string {
    const p2wsh = bitcoin.payments.p2wsh({
      redeem: { output: redeemScript },
      network,
    });

    if (!p2wsh.address) {
      throw new BadRequestException(RESPONSE_CODE.escrow.psbtConstructionFailed);
    }

    return p2wsh.address;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Taproot (P2TR) 2-of-3 multisig via tapscript OP_CHECKSIGADD
  // 3 leaves: (borrower+lender), (borrower+bound), (lender+bound)
  // Internal key = NUMS point → no key path spend
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a P2TR 2-of-3 multisig address using tapscript.
   * Each spending path is one of the 3 possible 2-of-3 key combinations.
   */
  createTaprootMultisig(params: ITaprootMultisigParams): ITaprootMultisigResult {
    bitcoin.initEccLib(ecc);
    const network = params.network ?? bitcoin.networks.regtest;

    const borrowerXOnly = this.toXOnly(params.borrowerPubkey);
    const lenderXOnly = this.toXOnly(params.lenderPubkey);
    const boundXOnly = this.toXOnly(params.boundPubkey);

    // Build 3 tapscript leaves — each is a 2-of-2 via OP_CHECKSIGADD
    const leafBorrowerLender = this.buildChecksigaddLeaf(borrowerXOnly, lenderXOnly);
    const leafBorrowerBound = this.buildChecksigaddLeaf(borrowerXOnly, boundXOnly);
    const leafLenderBound = this.buildChecksigaddLeaf(lenderXOnly, boundXOnly);

    // Binary tree: borrower+lender at top (most common path), others as subtree
    const scriptTree: Taptree = [
      { output: leafBorrowerLender },
      [{ output: leafBorrowerBound }, { output: leafLenderBound }],
    ];

    const p2tr = bitcoin.payments.p2tr({
      internalPubkey: NUMS_INTERNAL_KEY,
      scriptTree,
      network,
    });

    if (!p2tr.address) {
      throw new BadRequestException(RESPONSE_CODE.escrow.psbtConstructionFailed);
    }

    return {
      address: p2tr.address,
      borrowerXOnly,
      lenderXOnly,
      boundXOnly,
      leafBorrowerLender,
      leafBorrowerBound,
      leafLenderBound,
      scriptTree,
      network,
    };
  }

  /**
   * Build a 2-of-2 tapscript leaf using OP_CHECKSIGADD:
   * <pkA> OP_CHECKSIG <pkB> OP_CHECKSIGADD OP_2 OP_NUMEQUAL
   */
  private buildChecksigaddLeaf(pkA: Buffer, pkB: Buffer): Buffer {
    return bitcoin.script.compile([
      pkA,
      bitcoin.opcodes.OP_CHECKSIG,
      pkB,
      bitcoin.opcodes.OP_CHECKSIGADD,
      bitcoin.opcodes.OP_2,
      bitcoin.opcodes.OP_NUMEQUAL,
    ]);
  }

  /**
   * Extract x-only pubkey (32 bytes) from 33-byte compressed pubkey.
   * Validates pubkey is compressed (02/03 prefix).
   */
  private toXOnly(compressedPubkeyHex: string): Buffer {
    const buf = Buffer.from(compressedPubkeyHex, 'hex');
    if (buf.length !== 33) {
      throw new BadRequestException(RESPONSE_CODE.escrow.invalidPubkey);
    }
    if (buf[0] !== 0x02 && buf[0] !== 0x03) {
      throw new BadRequestException(RESPONSE_CODE.escrow.invalidPubkey);
    }
    return buf.slice(1); // x-only = drop parity byte
  }
}
