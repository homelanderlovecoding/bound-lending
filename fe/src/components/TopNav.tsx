'use client';

import { useState } from 'react';
import { ChevronDown, Sun, Moon, Wallet, LogOut, Loader2, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import type { WalletType } from '@/lib/wallet';

const NAV_LINKS = [
  { label: 'Trade', href: '/trade' },
  { label: 'Markets', href: '/markets' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'Analytics', href: '/analytics' },
];

const MORE_LINKS = [
  { label: 'Launchpad', href: '/launchpad' },
  { label: 'Earn', href: '/earn' },
  { label: 'Borrow', href: '/borrow' },
];

const WALLETS: { type: WalletType; name: string; icon: string; url: string }[] = [
  { type: 'unisat', name: 'UniSat', icon: '🟡', url: 'https://unisat.io' },
  { type: 'xverse', name: 'Xverse', icon: '🟠', url: 'https://www.xverse.app' },
];

export default function TopNav({ currentPage = 'borrow' }: { currentPage?: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const { wallet, isConnecting, error, connect, disconnect } = useAuth();

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('light');
  };

  const handleConnect = async (type: WalletType) => {
    try {
      await connect(type);
      setShowWalletModal(false);
    } catch {
      // Error is handled in context
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setShowAccountMenu(false);
  };

  const isMoreActive = MORE_LINKS.some((l) => l.href === `/${currentPage}`);
  const shortAddr = wallet ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : '';

  return (
    <>
      <nav className="flex items-center justify-between px-5 h-12 bg-[var(--bg-secondary)] border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="font-headline text-[22px] font-extrabold text-[var(--gold-light)] tracking-[-0.02em] flex items-center gap-2">
            <BoundLogo />
            <span>Bound</span>
          </div>

          {/* Nav Links */}
          <div className="flex gap-6 items-center">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={clsx(
                  'text-sm font-medium no-underline transition-colors duration-150',
                  currentPage === link.label.toLowerCase()
                    ? 'text-[var(--gold-light)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                {link.label}
              </a>
            ))}

            {/* More dropdown */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className={clsx(
                  'text-sm font-medium transition-colors duration-150 cursor-pointer bg-transparent border-0 flex items-center gap-1',
                  isMoreActive ? 'text-[var(--gold-light)]' : 'text-[var(--text-secondary)]',
                )}
              >
                More <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {moreOpen && (
                <div className="absolute top-[calc(100%+10px)] left-1/2 -translate-x-1/2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s py-1.5 min-w-[140px] z-50 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                  {MORE_LINKS.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className={clsx(
                        'block px-4 py-2 text-[13px] font-medium no-underline hover:bg-[var(--bg-tertiary)]',
                        currentPage === link.label.toLowerCase()
                          ? 'text-[var(--gold-light)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[var(--text-secondary)] px-2.5 py-1.5 rounded-full text-sm cursor-pointer"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Wallet connect / Account button */}
          {!wallet ? (
            <button
              onClick={() => setShowWalletModal(true)}
              className="bg-[var(--gold-dark)] border-0 text-[var(--parchment)] px-4 py-1.5 rounded-full text-[13px] font-semibold font-headline cursor-pointer hover:bg-[var(--gold-light)] flex items-center gap-2 transition-colors duration-150"
            >
              <Wallet className="w-3.5 h-3.5" />
              Connect Wallet
            </button>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[var(--gold-light)] px-4 py-1.5 rounded-full text-[13px] font-headline cursor-pointer flex items-center gap-2"
              >
                <span className="text-[11px]">{wallet.type === 'unisat' ? '🟡' : '🟠'}</span>
                {shortAddr}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showAccountMenu && (
                <div className="absolute top-[calc(100%+8px)] right-0 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s py-1.5 min-w-[180px] z-50 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                  <div className="px-4 py-2 text-[11px] text-[var(--text-muted)] border-b border-[var(--border)]">
                    {wallet.type === 'unisat' ? 'UniSat' : 'Xverse'} · {wallet.address.slice(0, 12)}...
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="w-full text-left px-4 py-2 text-[13px] text-[var(--red-text)] bg-transparent border-0 cursor-pointer hover:bg-[var(--bg-tertiary)] flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Disconnect
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Wallet Selection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !isConnecting && setShowWalletModal(false)}>
          <div
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-6 w-[380px] shadow-[0_16px_48px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">Connect Wallet</h3>
              <button
                onClick={() => !isConnecting && setShowWalletModal(false)}
                className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[13px] text-[var(--text-muted)] mb-5 leading-relaxed">
              Connect your Bitcoin wallet to start borrowing. Make sure your wallet is on <span className="text-[var(--gold)] font-medium">signet</span> network.
            </p>

            {error && (
              <div className="bg-[rgba(200,50,50,0.1)] border border-[rgba(200,50,50,0.3)] rounded-s px-3 py-2.5 text-[12px] text-[var(--red-text)] mb-4">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {WALLETS.map((w) => (
                <button
                  key={w.type}
                  onClick={() => handleConnect(w.type)}
                  disabled={isConnecting}
                  className="flex items-center gap-4 w-full px-4 py-3.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-s cursor-pointer hover:border-[var(--gold-dark)] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-2xl">{w.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">{w.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {w.type === 'unisat' ? 'BRC-20 · Runes · Ordinals' : 'Stacks · BTC · Ordinals'}
                    </div>
                  </div>
                  {isConnecting && (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-5 text-center text-[11px] text-[var(--text-muted)]">
              Don't have a wallet?{' '}
              <a href="https://unisat.io" target="_blank" rel="noopener noreferrer" className="text-[var(--gold-dark)] no-underline hover:underline">
                Get UniSat
              </a>
              {' · '}
              <a href="https://www.xverse.app" target="_blank" rel="noopener noreferrer" className="text-[var(--gold-dark)] no-underline hover:underline">
                Get Xverse
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BoundLogo() {
  return (
    <svg width="29" height="28" viewBox="0 0 29 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path d="M14.017 28C21.7584 28 28.034 21.732 28.034 14C28.034 6.26801 21.7584 0 14.017 0C6.27563 0 0 6.26801 0 14C0 21.732 6.27563 28 14.017 28Z" fill="#F7F7F7"/>
      <path d="M17.7046 17.2886C17.7046 16.3873 18.4444 15.6484 19.3467 15.6484C20.2491 15.6484 20.9889 16.3873 20.9889 17.2886C20.9889 18.1898 20.2491 18.9287 19.3467 18.9287C18.4444 18.9287 17.7046 18.1954 17.7046 17.2886Z" fill="#262626"/>
      <path d="M11.0464 16.4922C11.9488 16.4922 12.683 17.2255 12.683 18.1323C12.683 19.0392 11.9488 19.7725 11.0464 19.7725C10.1441 19.7725 9.4043 19.0336 9.4043 18.1323C9.4043 17.2311 10.1441 16.4922 11.0464 16.4922Z" fill="#262626"/>
      <path d="M13.7984 20.7174C13.5742 20.4487 13.7536 20.0457 14.1011 20.0289L16.8865 19.8834C17.2284 19.8666 17.447 20.236 17.2676 20.5271L16.029 22.5143C15.8777 22.755 15.5302 22.783 15.3453 22.5647L13.7928 20.723L13.7984 20.7174Z" fill="#E59A00"/>
    </svg>
  );
}
