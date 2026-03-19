import { Test, TestingModule } from '@nestjs/testing';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { SigningService } from './signing.service';
import { MultisigService } from './multisig.service';
import { PsbtService } from './psbt.service';
import { IUtxoInput } from './escrow.type';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.regtest;

const ESTIMATED_FEE_SATS = 2000;

function makeKeyPair(seed: number) {
  return ECPair.fromPrivateKey(Buffer.alloc(32, seed), { network });
}

/** Derive a real P2WPKH regtest address from a keypair seed */
function makeAddress(seed: number): string {
  const kp = makeKeyPair(seed);
  return bitcoin.payments.p2wpkh({ pubkey: kp.publicKey, network }).address!;
}

function buildLiquidationPsbt(
  psbtService: PsbtService,
  multisigUtxo: IUtxoInput,
  redeemScript: Buffer,
  lenderBtcAddress: string,
): bitcoin.Psbt {
  return psbtService.buildLiquidationPsbt({
    multisigUtxo,
    lenderBtcAddress,
    redeemScript,
    network,
  });
}

describe('SigningService', () => {
  let service: SigningService;
  let psbtService: PsbtService;
  let multisigService: MultisigService;

  const borrowerKp = makeKeyPair(1);
  const lenderKp = makeKeyPair(2);
  const boundKp = makeKeyPair(3);

  const borrowerPub = borrowerKp.publicKey.toString('hex');
  const lenderPub = lenderKp.publicKey.toString('hex');
  const boundPub = boundKp.publicKey.toString('hex');

  let redeemScript: Buffer;
  let multisigUtxo: IUtxoInput;
  const lenderBtcAddress = makeAddress(9);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SigningService, PsbtService, MultisigService],
    }).compile();

    service = module.get<SigningService>(SigningService);
    psbtService = module.get<PsbtService>(PsbtService);
    multisigService = module.get<MultisigService>(MultisigService);

    const ms = multisigService.createMultisigAddress({
      borrowerPubkey: borrowerPub,
      lenderPubkey: lenderPub,
      boundPubkey: boundPub,
      network,
    });
    redeemScript = ms.redeemScript;

    multisigUtxo = {
      txid: Buffer.alloc(32, 0xaa).toString('hex'),
      vout: 0,
      value: 100_000,
    };
  });

  describe('signPsbtInput', () => {
    it('should sign a specific PSBT input and add partialSig entry', () => {
      const psbt = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);
      service.signPsbtInput(psbt, borrowerKp, 0);
      expect(psbt.data.inputs[0].partialSig).toHaveLength(1);
    });
  });

  describe('signAllInputs', () => {
    it('should sign all inputs matching a keypair', () => {
      const psbt = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);
      service.signAllInputs(psbt, borrowerKp);
      expect(psbt.data.inputs[0].partialSig).toHaveLength(1);
    });
  });

  describe('combinePsbts', () => {
    it('should combine two partially-signed PSBTs and merge signatures', () => {
      const psbt1 = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);
      const psbt2 = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);

      service.signAllInputs(psbt1, borrowerKp);
      service.signAllInputs(psbt2, lenderKp);

      const combined = service.combinePsbts(psbt1, psbt2);
      expect(combined.data.inputs[0].partialSig).toHaveLength(2);
    });
  });

  describe('validateSignatures', () => {
    it('should return true when 2-of-3 signatures are present', () => {
      const psbt = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);
      service.signAllInputs(psbt, borrowerKp);
      service.signAllInputs(psbt, lenderKp);
      expect(service.validateSignatures(psbt)).toBe(true);
    });

    it('should return false when only 1-of-3 signatures are present', () => {
      const psbt = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);
      service.signAllInputs(psbt, borrowerKp);
      expect(service.validateSignatures(psbt)).toBe(false);
    });
  });

  describe('finalizePsbt', () => {
    it('should finalize successfully with 2-of-3 signatures', () => {
      const psbt = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);
      service.signAllInputs(psbt, borrowerKp);
      service.signAllInputs(psbt, lenderKp);
      expect(() => service.finalizePsbt(psbt)).not.toThrow();
    });

    it('should throw BadRequestException when only 1-of-3 signatures present', () => {
      const psbt = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);
      service.signAllInputs(psbt, borrowerKp);
      expect(() => service.finalizePsbt(psbt)).toThrow();
    });
  });

  describe('extractTransaction', () => {
    it('should produce a valid TX with correct witness stack after finalize + extract', () => {
      const psbt = buildLiquidationPsbt(psbtService, multisigUtxo, redeemScript, lenderBtcAddress);
      service.signAllInputs(psbt, borrowerKp);
      service.signAllInputs(psbt, lenderKp);
      service.finalizePsbt(psbt);

      const hex = service.extractTransaction(psbt);
      expect(typeof hex).toBe('string');
      expect(hex.length).toBeGreaterThan(0);

      const tx = bitcoin.Transaction.fromHex(hex);
      expect(tx.ins.length).toBe(1);
      expect(tx.outs.length).toBe(1);
      // Witness: OP_0, sig1, sig2, redeemScript = 4 items
      expect(tx.ins[0].witness.length).toBe(4);
      expect(tx.outs[0].value).toBe(multisigUtxo.value - ESTIMATED_FEE_SATS);
    });
  });
});
