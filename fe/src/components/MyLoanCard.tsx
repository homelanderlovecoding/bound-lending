'use client';

import clsx from 'clsx';
import { formatNumber, formatUsd, calculateLtv, estLiquidationPrice } from '@/lib/utils';
import type { Loan } from '@/lib/types';

interface MyLoanCardProps {
  loan: Loan;
  btcPrice: number;
  onRepay?: (loanId: string) => void;
}

function statusBadge(state: string) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    active: { label: 'Active', bg: 'rgba(122,143,106,0.2)', text: 'var(--green)' },
    grace: { label: 'Grace Period', bg: 'rgba(229,154,0,0.2)', text: 'var(--gold)' },
    origination_pending: { label: 'Pending', bg: 'rgba(125,128,135,0.2)', text: 'var(--text-muted)' },
  };
  const badge = map[state] ?? { label: state, bg: 'rgba(125,128,135,0.2)', text: 'var(--text-muted)' };
  return (
    <span
      className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: badge.bg, color: badge.text }}
    >
      {badge.label}
    </span>
  );
}

function daysLeft(expiresAt?: string): string | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days}d left`;
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function formatTermDates(loan: Loan): string {
  const start = loan.terms.originatedAt
    ? new Date(loan.terms.originatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const end = loan.terms.termExpiresAt
    ? new Date(loan.terms.termExpiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  return `${start} → ${end}`;
}

export default function MyLoanCard({ loan, btcPrice, onRepay }: MyLoanCardProps) {
  const ltv = calculateLtv(loan.terms.principalUsd, loan.terms.collateralBtc, btcPrice);
  const liqPrice = estLiquidationPrice(loan.terms.totalDebt, loan.terms.collateralBtc);
  const expired = isExpired(loan.terms.termExpiresAt);
  const remaining = loan.state === 'grace' ? daysLeft(loan.terms.graceExpiresAt) : null;
  const isGrace = loan.state === 'grace';
  const loanNum = loan._id.slice(-4).toUpperCase();

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 flex-1 min-w-[440px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-semibold font-headline text-[var(--text-primary)]">
            #LN-{loanNum}
          </span>
          {statusBadge(loan.state)}
          {remaining && (
            <span className="text-[12px] font-medium text-[var(--gold)]">{remaining}</span>
          )}
        </div>
        {onRepay && (loan.state === 'active' || loan.state === 'grace') && (
          <button
            onClick={() => onRepay(loan._id)}
            className={clsx(
              'px-5 py-2 rounded-full text-[13px] font-semibold border-0 cursor-pointer',
              isGrace
                ? 'bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)]'
                : 'bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)]',
            )}
          >
            {isGrace ? 'Repay Now' : 'Repay'}
          </button>
        )}
      </div>

      {/* Body — 2 column grid */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-5">
        <div>
          <div className="text-[11px] text-[var(--text-muted)] mb-0.5">Borrowed</div>
          <div className="text-[14px] font-semibold font-headline text-[var(--text-primary)]">
            {formatNumber(loan.terms.principalUsd)} bUSD
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)] mb-0.5">Collateral</div>
          <div className="text-[14px] font-semibold font-headline text-[var(--text-primary)]">
            {loan.terms.collateralBtc.toFixed(6)} BTC
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)] mb-0.5">Rate / LTV</div>
          <div className="text-[14px] font-medium font-headline text-[var(--text-primary)]">
            {loan.terms.rateApr}% APR · {ltv.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)] mb-0.5">Lender</div>
          <div className="text-[14px] font-medium font-headline text-[var(--text-primary)]">
            {loan.lender.length > 20 ? loan.lender.slice(0, 8) + '...' : loan.lender}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)] mb-0.5">Term</div>
          <div className={clsx(
            'text-[14px] font-medium font-headline',
            expired ? 'text-[var(--red-text)]' : 'text-[var(--text-primary)]',
          )}>
            {formatTermDates(loan)}{expired ? ' (expired)' : ''}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)] mb-0.5">Total to Repay</div>
          <div className="text-[14px] font-semibold font-headline text-[var(--text-primary)]">
            {formatNumber(loan.terms.totalDebt, 2)} bUSD
          </div>
        </div>
      </div>

      {/* Footer — Liquidation Price */}
      <div className="flex justify-between items-center pt-4 border-t border-[var(--border)]">
        <span className="text-[12px] text-[var(--text-muted)]">Liquidation Price</span>
        <span className="text-[14px] font-semibold font-headline text-[var(--green)]">
          {formatUsd(liqPrice)}
        </span>
      </div>
    </div>
  );
}
