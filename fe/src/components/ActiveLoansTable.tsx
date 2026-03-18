'use client';

import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';
import type { Loan } from '@/lib/types';

interface ActiveLoansTableProps {
  loans: Loan[];
  totalCount: number;
  totalCollateralBtc: number;
}

type SortKey = 'status' | 'amount' | 'collateral' | 'rate' | 'ltv' | 'lender' | 'expires';

function statusBadge(state: string) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-[rgba(122,143,106,0.15)] text-[var(--green)]' },
    grace: { label: 'Grace', className: 'bg-[rgba(255,183,0,0.15)] text-[var(--gold)]' },
    origination_pending: { label: 'Pending', className: 'bg-[rgba(125,128,135,0.15)] text-[var(--text-muted)]' },
  };
  const badge = map[state] ?? { label: state, className: 'bg-[rgba(125,128,135,0.15)] text-[var(--text-muted)]' };
  return <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', badge.className)}>{badge.label}</span>;
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
          <div>Lender</div>
          <div className="text-right">Expires</div>
        </div>

        {/* Rows */}
        {sorted.map((loan) => (
          <div
            key={loan._id}
            className="grid grid-cols-[80px_80px_1fr_1fr_80px_70px_1fr_90px] gap-3 px-5 py-3 text-[12px] border-b border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-colors duration-100"
          >
            <div className="font-medium font-headline text-[var(--text-primary)]">#{loan._id.slice(-4).toUpperCase()}</div>
            <div>{statusBadge(loan.state)}</div>
            <div className="text-right font-headline text-[var(--text-primary)]">{loan.terms.principalUsd.toLocaleString()}</div>
            <div className="text-right font-headline text-[var(--text-primary)]">{loan.terms.collateralBtc.toFixed(4)} BTC</div>
            <div className="text-right font-headline text-[var(--text-primary)]">{loan.terms.rateApr}%</div>
            <div className="text-right font-headline" style={{ color: (loan.liquidation?.lastLtv ?? 0) >= 80 ? 'var(--gold)' : 'var(--text-primary)' }}>
              {loan.liquidation?.lastLtv?.toFixed(1) ?? '—'}%
            </div>
            <div className="text-[var(--text-secondary)]">{loan.lender.slice(0, 8)}...</div>
            <div className="text-right font-headline text-[var(--text-secondary)]">
              {loan.terms.termExpiresAt ? new Date(loan.terms.termExpiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
