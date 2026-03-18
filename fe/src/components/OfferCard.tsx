'use client';

import clsx from 'clsx';

interface OfferCardProps {
  lender: string;
  rateApr: number;
  originationFeePct: number;
  totalRepay: number;
  interestCost: number;
  selected: boolean;
  onClick: () => void;
}

export default function OfferCard({
  lender,
  rateApr,
  originationFeePct,
  totalRepay,
  interestCost,
  selected,
  onClick,
}: OfferCardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-[var(--bg-secondary)] border rounded-s p-5 cursor-pointer transition-all duration-150 hover:border-[var(--gold-dark)]',
        selected
          ? 'border-[var(--gold-light)] shadow-[0_0_0_1px_var(--gold-dark)]'
          : 'border-[var(--border)]',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[14px] font-semibold text-[var(--text-primary)]">{lender}</div>
        <div className="text-lg font-bold text-[var(--text-primary)] font-headline">
          {rateApr}% <span className="text-xs font-normal text-[var(--text-muted)]">APR</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-[12px]">
        <div>
          <div className="text-[var(--text-muted)] mb-0.5">Orig. Fee</div>
          <div className="text-[var(--text-primary)] font-medium font-headline">{originationFeePct}%</div>
        </div>
        <div>
          <div className="text-[var(--text-muted)] mb-0.5">Total Repay</div>
          <div className="text-[var(--text-primary)] font-medium font-headline">${totalRepay.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <div>
          <div className="text-[var(--text-muted)] mb-0.5">Interest Cost</div>
          <div className="text-[var(--text-primary)] font-medium font-headline">${interestCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
      </div>
    </div>
  );
}
