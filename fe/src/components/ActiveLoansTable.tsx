'use client';

import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';
import type { Loan } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface ActiveLoansTableProps {
  loans: Loan[];
  totalCount: number;
  totalCollateralBtc: number;
}

type SortKey = 'status' | 'amount' | 'collateral' | 'rate' | 'ltv' | 'lender' | 'expires';

function statusBadge(state: string) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    active: { label: 'Active', bg: 'rgba(122,143,106,0.2)', text: 'var(--green)' },
    grace: { label: 'Grace', bg: 'rgba(229,154,0,0.2)', text: 'var(--gold)' },
    origination_pending: { label: 'Pending', bg: 'rgba(125,128,135,0.2)', text: 'var(--text-muted)' },
  };
  const badge = map[state] ?? { label: state, bg: 'rgba(125,128,135,0.2)', text: 'var(--text-muted)' };
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: badge.bg, color: badge.text }}
    >
      {badge.label}
    </span>
  );
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function formatExpiry(loan: Loan): { text: string; expired: boolean } {
  const expiresAt = loan.terms.termExpiresAt;
  if (!expiresAt) return { text: '—', expired: false };
  const expired = isExpired(expiresAt);
  if (expired) return { text: 'Expired', expired: true };
  return {
    text: new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    expired: false,
  };
}

export default function ActiveLoansTable({ loans, totalCount, totalCollateralBtc }: ActiveLoansTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...loans].sort((a, b) => {
    if (!sortKey) return 0;
    const dir = sortAsc ? 1 : -1;
    switch (sortKey) {
      case 'amount': return (a.terms.principalUsd - b.terms.principalUsd) * dir;
      case 'collateral': return (a.terms.collateralBtc - b.terms.collateralBtc) * dir;
      case 'rate': return (a.terms.rateApr - b.terms.rateApr) * dir;
      case 'ltv': return ((a.liquidation?.lastLtv ?? 0) - (b.liquidation?.lastLtv ?? 0)) * dir;
      case 'status': return a.state.localeCompare(b.state) * dir;
      case 'lender': return (a.lender ?? '').localeCompare(b.lender ?? '') * dir;
      default: return 0;
    }
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="inline-block w-2.5 h-2.5" />;
    return sortAsc ? <ArrowUp className="inline-block w-2.5 h-2.5" /> : <ArrowDown className="inline-block w-2.5 h-2.5" />;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-[var(--text-primary)]">All Active Loans</div>
        <div className="text-[12px] text-[var(--text-muted)]">
          <span className="font-headline font-medium">{totalCount}</span> active ·{' '}
          <span className="font-headline font-medium">{totalCollateralBtc.toFixed(2)} BTC</span> locked
        </div>
      </div>

      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[80px_80px_1fr_1fr_80px_70px_1fr_90px] gap-3 px-5 py-3 text-[11px] text-[var(--text-muted)] font-semibold border-b border-[var(--border)] uppercase tracking-wide">
          <div>Loan</div>
          <div className="cursor-pointer select-none" onClick={() => handleSort('status')}>Status <SortIcon col="status" /></div>
          <div className="text-right cursor-pointer select-none" onClick={() => handleSort('amount')}>Amount <SortIcon col="amount" /></div>
          <div className="text-right cursor-pointer select-none" onClick={() => handleSort('collateral')}>Collateral <SortIcon col="collateral" /></div>
          <div className="text-right cursor-pointer select-none" onClick={() => handleSort('rate')}>Rate <SortIcon col="rate" /></div>
          <div className="text-right cursor-pointer select-none" onClick={() => handleSort('ltv')}>LTV <SortIcon col="ltv" /></div>
          <div className="cursor-pointer select-none" onClick={() => handleSort('lender')}>Lender <SortIcon col="lender" /></div>
          <div className="text-right">Expires</div>
        </div>

        {/* Empty state */}
        {sorted.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-[var(--text-muted)]">
            No active loans yet
          </div>
        )}

        {/* Rows */}
        {sorted.map((loan) => {
          const loanNum = loan._id.slice(-4).toUpperCase();
          const ltv = loan.liquidation?.lastLtv ?? 0;
          const isHighLtv = ltv >= 80;
          const expiry = formatExpiry(loan);

          return (
            <div
              key={loan._id}
              className="grid grid-cols-[80px_80px_1fr_1fr_80px_70px_1fr_90px] gap-3 px-5 py-3 text-[12px] border-b border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-colors duration-100"
            >
              <div className="font-medium font-headline" style={{ color: 'var(--gold-dark)' }}>
                #LN-{loanNum}
              </div>
              <div>{statusBadge(loan.state)}</div>
              <div className="text-right font-headline text-[var(--text-primary)]">
                {formatNumber(loan.terms.principalUsd)}
              </div>
              <div className="text-right font-headline text-[var(--text-primary)]">
                {loan.terms.collateralBtc.toFixed(4)} BTC
              </div>
              <div className="text-right font-headline text-[var(--text-primary)]">
                {loan.terms.rateApr}%
              </div>
              <div
                className="text-right font-headline"
                style={{ color: isHighLtv ? 'var(--red-text)' : 'var(--text-primary)' }}
              >
                {ltv > 0 ? `${ltv.toFixed(1)}%` : '—'}
              </div>
              <div className="text-[var(--text-secondary)] truncate">
                {loan.lender ? (loan.lender.length > 12 ? loan.lender.slice(0, 8) + '...' : loan.lender) : '—'}
              </div>
              <div
                className="text-right font-headline"
                style={{ color: expiry.expired ? 'var(--red-text)' : 'var(--text-secondary)' }}
              >
                {expiry.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
