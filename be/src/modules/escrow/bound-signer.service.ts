import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import { ENV_REGISTER, RESPONSE_CODE } from '../../commons/constants';
import { IBitcoinConfig } from '../../commons/types';
import { ITaprootMultisigResult } from './escrow.type';

const ECPair = ECPairFactory(ecc);

@Injectable()
export class BoundSignerService {
  private readonly logger = new Logger(BoundSignerService.name);
  private readonly network: bitcoin.Network;
  private readonly boundPrivateKey: string;
  private readonly boundPubkey: string;

  constructor(private readonly configService: ConfigService) {
    bitcoin.initEccLib(ecc);
    const btcConfig = this.configService.get<IBitcoinConfig>(ENV_REGISTER.BITCOIN)!;
    this.boundPrivateKey = btcConfig.boundPrivateKey;
    this.boundPubkey = btcConfig.boundPubkey;
    this.network = this.resolveNetwork(btcConfig.network);
  }

  /**
   * Get Bound's x-only public key (32 bytes) for taproot.
   */
  getBoundXOnly(): Buffer {
    if (!this.boundPubkey) {
      throw new BadRequestException(RESPONSE_CODE.escrow.invalidPubkey);
    }
    const buf = Buffer.from(this.boundPubkey, 'hex');
    return buf.slice(1); // drop parity byte
  }

  /**
   * Get Bound's full 33-byte compressed public key.
   */
  getBoundPubkey(): string {
    return this.boundPubkey;
  }

  /**
   * Sign a taproot PSBT input (script path) with Bound's key.
   * Uses taproot schnorr signing via input.tapLeafScript.
   */
  signTaprootInput(psbt: bitcoin.Psbt, inputIndex: number): bitcoin.Psbt {
    this.validatePrivateKey();

    const keyPair = ECPair.fromWIF(this.boundPrivateKey, this.network);
    const tweakedSigner = keyPair.tweak(
      bitcoin.crypto.taggedHash('TapTweak', keyPair.publicKey.slice(1)),
    );

    try {
      psbt.signTaprootInput(inputIndex, tweakedSigner);
      return psbt;
    } catch {
      // Fallback: sign as script path (no tweak needed for script path)
      psbt.signTaprootInput(inputIndex, keyPair);
      return psbt;
    }
  }

  /**
   * Sign all taproot inputs in a PSBT with Bound's key.
   */
  signAllTaprootInputs(psbt: bitcoin.Psbt): bitcoin.Psbt {
    this.validatePrivateKey();
    const keyPair = ECPair.fromWIF(this.boundPrivateKey, this.network);

    for (let i = 0; i < psbt.data.inputs.length; i++) {
      if (psbt.data.inputs[i].tapLeafScript?.length) {
        try {
          psbt.signTaprootInput(i, keyPair);
        } catch (err) {
          this.logger.error(`Failed to sign taproot input ${i}: ${err}`);
          throw new BadRequestException(RESPONSE_CODE.escrow.invalidSignature);
        }
      }
    }

    return psbt;
  }

  /**
   * Combine two PSBTs (merge partial signatures) and finalize.
   */
  combineFinalizeAndExtract(psbt1: bitcoin.Psbt, psbt2: bitcoin.Psbt): string {
    psbt1.combine(psbt2);

    try {
      psbt1.finalizeAllInputs();
    } catch (err) {
      this.logger.error(`PSBT finalization failed: ${err}`);
      throw new BadRequestException(RESPONSE_CODE.escrow.finalizationFailed);
    }

    return psbt1.extractTransaction().toHex();
  }

  /**
   * Validate signatures and finalize a PSBT.
   * For taproot script path: checks tapScriptSig entries.
   */
  finalizeTaprootPsbt(psbt: bitcoin.Psbt): bitcoin.Psbt {
    try {
      psbt.finalizeAllInputs();
      return psbt;
    } catch (err) {
      this.logger.error(`Taproot PSBT finalization failed: ${err}`);
      throw new BadRequestException(RESPONSE_CODE.escrow.finalizationFailed);
    }
  }

  /**
   * Extract hex transaction from finalized PSBT.
   */
  extractTxHex(psbt: bitcoin.Psbt): string {
    return psbt.extractTransaction().toHex();
  }

  /**
   * Deserialize a PSBT from hex.
   */
  psbtFromHex(hex: string): bitcoin.Psbt {
    return bitcoin.Psbt.fromHex(hex, { network: this.network });
  }

  /**
   * Serialize a PSBT to hex.
   */
  psbtToHex(psbt: bitcoin.Psbt): string {
    return psbt.toHex();
  }

  /**
   * Check if Bound's private key is configured.
   */
  isConfigured(): boolean {
    return !!this.boundPrivateKey && !!this.boundPubkey;
  }

  private validatePrivateKey(): void {
    if (!this.boundPrivateKey) {
      throw new BadRequestException('Bound private key not configured');
    }
  }

  private resolveNetwork(network: string): bitcoin.Network {
    switch (network) {
      case 'mainnet': return bitcoin.networks.bitcoin;
      case 'testnet': return bitcoin.networks.testnet;
      default: return bitcoin.networks.regtest;
    }
  }
}
