'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { connectWallet, signMessage, type WalletType, type WalletInfo } from './wallet';
import { auth as authApi } from './api';

interface AuthState {
  wallet: WalletInfo | null;
  isConnecting: boolean;
  error: string;
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
}

const AuthContext = createContext<AuthState>({
  wallet: null,
  isConnecting: false,
  error: '',
  connect: async () => {},
  disconnect: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
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

      // 4. Verify with BE → get JWT
      const tokens = await authApi.verify(info.address, signature, challenge.nonce);

      // 5. Store tokens + wallet info
      localStorage.setItem('access_token', tokens.accessToken);
      localStorage.setItem('refresh_token', tokens.refreshToken);
      localStorage.setItem('wallet_info', JSON.stringify(info));

      setWallet(info);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('wallet_info');
    setWallet(null);
    setError('');
  }, []);

  return (
    <AuthContext.Provider value={{ wallet, isConnecting, error, connect, disconnect }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
