import { Test, TestingModule } from '@nestjs/testing';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { MultisigService } from './multisig.service';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.regtest;

/** Generate deterministic keypairs from seed bytes */
function makeKeyPair(seed: number): ReturnType<typeof ECPair.fromPrivateKey> {
  const privKey = Buffer.alloc(32, seed);
  return ECPair.fromPrivateKey(privKey, { network });
}

describe('MultisigService', () => {
  let service: MultisigService;

  const borrowerKp = makeKeyPair(1);
  const lenderKp = makeKeyPair(2);
  const boundKp = makeKeyPair(3);

  const borrowerPub = borrowerKp.publicKey.toString('hex');
  const lenderPub = lenderKp.publicKey.toString('hex');
  const boundPub = boundKp.publicKey.toString('hex');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MultisigService],
    }).compile();
    service = module.get<MultisigService>(MultisigService);
  });

  it('should generate a valid P2WSH address', () => {
    const result = service.createMultisigAddress({
      borrowerPubkey: borrowerPub,
      lenderPubkey: lenderPub,
      boundPubkey: boundPub,
      network,
    });

    expect(result.address).toBeDefined();
    expect(result.address.startsWith('bcrt1')).toBe(true); // regtest bech32
    expect(result.redeemScript).toBeInstanceOf(Buffer);
    expect(result.redeemScriptHex).toBe(result.redeemScript.toString('hex'));
  });

  it('should produce deterministic addresses (sorted pubkeys)', () => {
    const result1 = service.createMultisigAddress({
      borrowerPubkey: borrowerPub,
      lenderPubkey: lenderPub,
      boundPubkey: boundPub,
      network,
    });
    // Swap order — should get same address
    const result2 = service.createMultisigAddress({
      borrowerPubkey: boundPub,
      lenderPubkey: borrowerPub,
      boundPubkey: lenderPub,
      network,
    });

    expect(result1.address).toBe(result2.address);
  });

  it('should reject invalid pubkey (wrong length)', () => {
    expect(() =>
      service.createMultisigAddress({
        borrowerPubkey: 'aabbcc', // too short
        lenderPubkey: lenderPub,
        boundPubkey: boundPub,
        network,
      }),
    ).toThrow();
  });

  it('should reject invalid pubkey (wrong prefix)', () => {
    const badPub = '04' + borrowerPub.slice(2); // uncompressed prefix
    expect(() =>
      service.createMultisigAddress({
        borrowerPubkey: badPub,
        lenderPubkey: lenderPub,
        boundPubkey: boundPub,
        network,
      }),
    ).toThrow();
  });

  it('should generate different addresses for mainnet vs regtest', () => {
    const regtest = service.createMultisigAddress({
      borrowerPubkey: borrowerPub,
      lenderPubkey: lenderPub,
      boundPubkey: boundPub,
      network: bitcoin.networks.regtest,
    });
    const mainnet = service.createMultisigAddress({
      borrowerPubkey: borrowerPub,
      lenderPubkey: lenderPub,
      boundPubkey: boundPub,
      network: bitcoin.networks.bitcoin,
    });

    expect(regtest.address).not.toBe(mainnet.address);
    expect(mainnet.address.startsWith('bc1')).toBe(true);
    // redeemScript should be the same (network-independent)
    expect(regtest.redeemScriptHex).toBe(mainnet.redeemScriptHex);
  });
});
