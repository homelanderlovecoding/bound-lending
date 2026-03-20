'use client';

import type { WalletType } from './wallet';

/**
 * Sign a PSBT hex with the connected wallet.
 * UniSat: window.unisat.signPsbt(hex, opts)
 * Xverse: window.BitcoinProvider.request('signPsbt', { psbt, allowedSighash, broadcast })
 */
export async function signPsbt(
  type: WalletType,
  psbtHex: string,
  opts?: { broadcast?: boolean; finalize?: boolean },
): Promise<string> {
  if (type === 'unisat') {
    const unisat = (window as any).unisat;
    if (!unisat) throw new Error('UniSat not connected');

    // UniSat signPsbt returns signed PSBT hex
    const signed = await unisat.signPsbt(psbtHex, {
      autoFinalized: opts?.finalize ?? false,
    });
    return signed;
  }

  if (type === 'xverse') {
    const provider = (window as any).BitcoinProvider;
    if (!provider) throw new Error('Xverse not connected');

    const response = await provider.request('signPsbt', {
      psbt: psbtHex,
      allowedSighash: [0x00, 0x01, 0x02, 0x03, 0x81, 0x82, 0x83], // all sighash types
      broadcast: opts?.broadcast ?? false,
    });

    return response?.result?.psbt ?? response?.result;
  }

  throw new Error(`Unknown wallet type: ${type}`);
}
