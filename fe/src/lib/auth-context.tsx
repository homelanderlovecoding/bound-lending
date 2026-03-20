'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { connectWallet, signMessage, getBtcBalance, type WalletType, type WalletInfo } from './wallet';
import { auth as authApi } from './api';

interface AuthState {
  wallet: WalletInfo | null;
  btcBalance: number;
  isConnecting: boolean;
  error: string;
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  wallet: null,
  btcBalance: 0,
  isConnecting: false,
  error: '',
  connect: async () => {},
  disconnect: () => {},
  refreshBalance: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [btcBalance, setBtcBalance] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  // Restore wallet from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('wallet_info');
    const token = localStorage.getItem('access_token');
    if (stored && token) {
      try {
        setWallet(JSON.parse(stored));
      } catch {
        localStorage.removeItem('wallet_info');
        localStorage.removeItem('access_token');
      }
    }
  }, []);

  const connect = useCallback(async (type: WalletType) => {
    setError('');
    setIsConnecting(true);
    try {
      // 1. Connect wallet extension
      const info = await connectWallet(type);

      // 2. Get challenge from BE
      const challenge = await authApi.challenge(info.address);

      // 3. Sign the challenge message
      const signature = await signMessage(type, challenge.message, info.address);

      // 4. Verify with BE → get JWT (pass pubkey so it's stored on user record)
      const tokens = await authApi.verify(info.address, signature, challenge.nonce, info.publicKey);

      // 5. Store tokens + wallet info
      localStorage.setItem('access_token', tokens.accessToken);
      localStorage.setItem('refresh_token', tokens.refreshToken);
      localStorage.setItem('wallet_info', JSON.stringify(info));

      setWallet(info);

      // 6. Fetch BTC balance
      const balance = await getBtcBalance(type);
      setBtcBalance(balance);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    const balance = await getBtcBalance(wallet.type);
    setBtcBalance(balance);
  }, [wallet]);

  const disconnect = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('wallet_info');
    setWallet(null);
    setBtcBalance(0);
    setError('');
  }, []);

  return (
    <AuthContext.Provider value={{ wallet, btcBalance, isConnecting, error, connect, disconnect, refreshBalance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
