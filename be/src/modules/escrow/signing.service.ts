import { Injectable, BadRequestException } from '@nestjs/common';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { RESPONSE_CODE } from '../../commons/constants';

const ECPair = ECPairFactory(ecc);

@Injectable()
export class SigningService {
  constructor() {
    // Initialize ECC library for bitcoinjs-lib
    bitcoin.initEccLib(ecc);
  }

  /**
   * Sign a specific input of a PSBT with a keypair.
   */
  signPsbtInput(psbt: bitcoin.Psbt, keyPair: ECPairInterface, inputIndex: number): bitcoin.Psbt {
    try {
      psbt.signInput(inputIndex, keyPair);
      return psbt;
    } catch (error) {
      throw new BadRequestException(RESPONSE_CODE.escrow.invalidSignature);
    }
  }

  /**
   * Sign all inputs of a PSBT that match the given keypair.
   */
  signAllInputs(psbt: bitcoin.Psbt, keyPair: ECPairInterface): bitcoin.Psbt {
    try {
      psbt.signAllInputs(keyPair);
      return psbt;
    } catch (error) {
      throw new BadRequestException(RESPONSE_CODE.escrow.invalidSignature);
    }
  }

  /**
   * Combine two PSBTs (merge partial signatures).
   */
  combinePsbts(psbt1: bitcoin.Psbt, psbt2: bitcoin.Psbt): bitcoin.Psbt {
    psbt1.combine(psbt2);
    return psbt1;
  }

  /**
   * Validate that a PSBT has enough signatures (2-of-3) for all inputs.
   */
  validateSignatures(psbt: bitcoin.Psbt): boolean {
    try {
      for (let i = 0; i < psbt.data.inputs.length; i++) {
        const input = psbt.data.inputs[i];
        const partialSigs = input.partialSig ?? [];

        // Only check multisig inputs (those with witnessScript)
        if (input.witnessScript && partialSigs.length < 2) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Finalize all inputs and return the PSBT.
   * Requires 2-of-3 signatures on multisig inputs.
   */
  finalizePsbt(psbt: bitcoin.Psbt): bitcoin.Psbt {
    if (!this.validateSignatures(psbt)) {
      throw new BadRequestException(RESPONSE_CODE.escrow.insufficientSignatures);
    }

    try {
      psbt.finalizeAllInputs();
      return psbt;
    } catch (error) {
      throw new BadRequestException(RESPONSE_CODE.escrow.finalizationFailed);
    }
  }

  /**
   * Extract the final transaction hex from a finalized PSBT.
   */
  extractTransaction(psbt: bitcoin.Psbt): string {
    return psbt.extractTransaction().toHex();
  }

  /**
   * Create an ECPair from a WIF private key.
   */
  keyPairFromWif(wif: string, network?: bitcoin.Network): ECPairInterface {
    return ECPair.fromWIF(wif, network);
  }

  /**
   * Create an ECPair from a hex private key.
   */
  keyPairFromPrivateKey(privateKeyHex: string, network?: bitcoin.Network): ECPairInterface {
    return ECPair.fromPrivateKey(Buffer.from(privateKeyHex, 'hex'), { network });
  }

  /**
   * Deserialize a PSBT from hex.
   */
  psbtFromHex(hex: string, network?: bitcoin.Network): bitcoin.Psbt {
    return bitcoin.Psbt.fromHex(hex, { network: network ?? bitcoin.networks.regtest });
  }

  /**
   * Serialize a PSBT to hex.
   */
  psbtToHex(psbt: bitcoin.Psbt): string {
    return psbt.toHex();
  }
}
