import { Injectable, BadRequestException } from '@nestjs/common';
import * as bitcoin from 'bitcoinjs-lib';
import { RESPONSE_CODE } from '../../commons/constants';
import { IMultisigParams, IMultisigResult } from './escrow.type';

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
}
