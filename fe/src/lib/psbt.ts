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
  opts?: {
    broadcast?: boolean;
    finalize?: boolean;
    inputsToSign?: number[];  // which input indices this wallet should sign
  },
): Promise<string> {
  if (type === 'unisat') {
    const unisat = (window as any).unisat;
    if (!unisat) throw new Error('UniSat not connected');

    const signOpts: any = {
      autoFinalized: opts?.finalize ?? false,
    };

    // If specific inputs requested, use toSignInputs
    if (opts?.inputsToSign && opts.inputsToSign.length > 0) {
      const address = (await unisat.getAccounts())?.[0];
      signOpts.toSignInputs = opts.inputsToSign.map((index) => ({
        index,
        address,
      }));
    }

    const signed = await unisat.signPsbt(psbtHex, signOpts);
    return signed;
  }

  if (type === 'xverse') {
    const provider = (window as any).BitcoinProvider;
    if (!provider) throw new Error('Xverse not connected');

    const signOpts: any = {
      psbt: psbtHex,
      allowedSighash: [0x00, 0x01, 0x02, 0x03, 0x81, 0x82, 0x83],
      broadcast: opts?.broadcast ?? false,
    };

    // If specific inputs requested, tell Xverse which to sign
    if (opts?.inputsToSign && opts.inputsToSign.length > 0) {
      signOpts.signInputs = {};
      const accounts = await provider.request('getAccounts', null);
      const address = accounts?.result?.[0]?.address;
      if (address) {
        signOpts.signInputs[address] = opts.inputsToSign;
      }
    }

    const response = await provider.request('signPsbt', signOpts);
    return response?.result?.psbt ?? response?.result;
  }

  throw new Error(`Unknown wallet type: ${type}`);
}
