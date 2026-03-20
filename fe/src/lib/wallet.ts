'use client';

export type WalletType = 'unisat' | 'xverse';

export interface WalletInfo {
  type: WalletType;
  address: string;
  publicKey: string;
}

// ===== UniSat =====
function getUnisat(): any {
  return typeof window !== 'undefined' ? (window as any).unisat : null;
}

async function connectUnisat(): Promise<WalletInfo> {
  const unisat = getUnisat();
  if (!unisat) throw new Error('UniSat wallet not installed. Get it at unisat.io');

  // Switch to signet
  try {
    await unisat.switchNetwork('signet');
  } catch {
    // Might already be on signet
  }

  const accounts: string[] = await unisat.requestAccounts();
  if (!accounts.length) throw new Error('No accounts returned from UniSat');

  const publicKey: string = await unisat.getPublicKey();

  return {
    type: 'unisat',
    address: accounts[0],
    publicKey,
  };
}

async function signMessageUnisat(message: string): Promise<string> {
  const unisat = getUnisat();
  if (!unisat) throw new Error('UniSat wallet not connected');
  return unisat.signMessage(message);
}

// ===== Xverse =====
function getXverse(): any {
  return typeof window !== 'undefined' ? (window as any).BitcoinProvider : null;
}

async function connectXverse(): Promise<WalletInfo> {
  const provider = getXverse();
  if (!provider) throw new Error('Xverse wallet not installed. Get it at xverse.app');

  const response = await provider.request('getAccounts', {
    purposes: ['ordinals', 'payment'],
    message: 'Connect to Bound Lending',
  });

  if (!response?.result?.length) throw new Error('No accounts returned from Xverse');

  // Prefer payment address (for BTC), fallback to ordinals
  const paymentAccount = response.result.find((a: any) => a.purpose === 'payment') ?? response.result[0];

  return {
    type: 'xverse',
    address: paymentAccount.address,
    publicKey: paymentAccount.publicKey,
  };
}

async function signMessageXverse(message: string, address: string): Promise<string> {
  const provider = getXverse();
  if (!provider) throw new Error('Xverse wallet not connected');

  const response = await provider.request('signMessage', {
    address,
    message,
  });

  return response?.result?.signature ?? response?.result;
}

// ===== Balance =====
async function getBtcBalanceUnisat(): Promise<number> {
  const unisat = getUnisat();
  if (!unisat) return 0;
  const balance = await unisat.getBalance();
  // Returns { confirmed: number, unconfirmed: number, total: number } in satoshis
  return (balance.confirmed ?? balance.total ?? 0) / 1e8;
}

async function getBtcBalanceXverse(): Promise<number> {
  const provider = getXverse();
  if (!provider) return 0;
  const response = await provider.request('getBalance', null);
  // Returns balance in satoshis
  const satoshi = response?.result?.total ?? response?.result?.confirmed ?? 0;
  return satoshi / 1e8;
}

// ===== Unified API =====
export async function connectWallet(type: WalletType): Promise<WalletInfo> {
  if (type === 'unisat') return connectUnisat();
  if (type === 'xverse') return connectXverse();
  throw new Error(`Unknown wallet type: ${type}`);
}

export async function signMessage(type: WalletType, message: string, address?: string): Promise<string> {
  if (type === 'unisat') return signMessageUnisat(message);
  if (type === 'xverse') return signMessageXverse(message, address!);
  throw new Error(`Unknown wallet type: ${type}`);
}

export async function getBtcBalance(type: WalletType): Promise<number> {
  if (type === 'unisat') return getBtcBalanceUnisat();
  if (type === 'xverse') return getBtcBalanceXverse();
  return 0;
}

export function isWalletInstalled(type: WalletType): boolean {
  if (type === 'unisat') return !!getUnisat();
  if (type === 'xverse') return !!getXverse();
  return false;
}
