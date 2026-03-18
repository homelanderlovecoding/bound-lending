'use client';

import { useState, useCallback } from 'react';
import { Bitcoin, ShieldCheck } from 'lucide-react';
import LtvGauge from './LtvGauge';
import { calculateLtv, estLiquidationPrice, formatNumber, formatUsd } from '@/lib/utils';

interface BorrowInputFormProps {
  btcPrice: number;
  btcBalance: number;
  maxLtv: number;
  minLoanAmount: number;
  minTermDays: number;
  originationFeePct: number;
  onRequestQuotes: (collateral: number, amount: number, term: number) => void;
}

export default function BorrowInputForm({
  btcPrice,
  btcBalance,
  maxLtv,
  minLoanAmount,
  minTermDays,
  originationFeePct,
  onRequestQuotes,
}: BorrowInputFormProps) {
  const [collateral, setCollateral] = useState('');
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('');
  const [validation, setValidation] = useState('');

  const collNum = parseFloat(collateral) || 0;
  const amtNum = parseFloat(amount) || 0;
  const termNum = parseInt(term) || 0;
  const ltv = calculateLtv(amtNum, collNum, btcPrice);
  const collateralValue = collNum * btcPrice;
  const liqPrice = estLiquidationPrice(amtNum, collNum);
  const maxBorrow = Math.floor(collNum * btcPrice * (maxLtv / 100));

  const validate = useCallback(() => {
    if (collNum > btcBalance) return 'Insufficient BTC balance';
    if (amtNum > 0 && amtNum < minLoanAmount) return `Minimum loan amount is ${minLoanAmount} bUSD`;
    if (termNum > 0 && termNum < minTermDays) return `Minimum loan term is ${minTermDays} days`;
    if (ltv > maxLtv) return 'Implied LTV too high — reduce loan or increase collateral';
    return '';
  }, [collNum, amtNum, termNum, ltv, btcBalance, minLoanAmount, minTermDays, maxLtv]);

  const isReady = collNum > 0 && amtNum >= minLoanAmount && termNum >= minTermDays && ltv > 0 && ltv <= maxLtv;
  const error = validate();

  return (
    <div className="grid grid-cols-[1fr_340px] gap-6 items-start">
      <div>
        {/* Collateral Input */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 mb-4">
          <div className="text-xs text-[var(--text-muted)] mb-2 font-medium uppercase tracking-wide">Collateral</div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="w-full py-3 pl-4 pr-24 text-xl font-semibold text-[var(--text-primary)] bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-s font-headline outline-none focus:border-[var(--gold-dark)]"
            />
            <span className="absolute right-4 text-sm font-semibold text-[var(--text-muted)] pointer-events-none flex items-center gap-1.5">
              <Bitcoin className="w-4 h-4" /> BTC
            </span>
          </div>
          <div className="flex justify-between mt-2 text-[12px] text-[var(--text-muted)]">
            <span>Available: <span className="text-[var(--text-secondary)] font-headline font-medium">{btcBalance} BTC</span></span>
            <button onClick={() => setCollateral(btcBalance.toString())} className="text-[var(--gold-dark)] bg-transparent border-0 cursor-pointer text-[12px] font-semibold hover:text-[var(--gold-light)]">MAX</button>
          </div>
        </div>

        {/* Loan Amount Input */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">Loan Amount</div>
            <div className="text-[11px] text-[var(--text-muted)]">Min {minLoanAmount} bUSD</div>
          </div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              className="w-full py-3 pl-4 pr-20 text-xl font-semibold text-[var(--text-primary)] bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-s font-headline outline-none focus:border-[var(--gold-dark)]"
            />
            <span className="absolute right-4 text-sm font-semibold text-[var(--text-muted)] pointer-events-none">bUSD</span>
          </div>
          <input
            type="range"
            min={minLoanAmount}
            max={Math.max(minLoanAmount, maxBorrow)}
            value={amtNum || minLoanAmount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full mt-3 h-1 appearance-none cursor-pointer rounded-full"
            style={{
              background: `linear-gradient(to right, var(--gold-dark) ${maxBorrow > 0 ? (amtNum / maxBorrow) * 100 : 0}%, var(--border) ${maxBorrow > 0 ? (amtNum / maxBorrow) * 100 : 0}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1 font-headline">
            <span>{minLoanAmount}</span>
            <span>{collNum > 0 ? `$${formatNumber(maxBorrow)} max` : `Max at ${maxLtv}% LTV`}</span>
          </div>
        </div>

        {/* Term Input */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">Loan Term</div>
            <div className="text-[11px] text-[var(--text-muted)]">Min {minTermDays} days</div>
          </div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
              className="w-full py-3 pl-4 pr-20 text-xl font-semibold text-[var(--text-primary)] bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-s font-headline outline-none focus:border-[var(--gold-dark)]"
            />
            <span className="absolute right-4 text-sm font-semibold text-[var(--text-muted)] pointer-events-none">days</span>
          </div>
        </div>

        {error && <div className="text-[12px] text-[var(--red-text)] mb-3">{error}</div>}

        <button
          onClick={() => onRequestQuotes(collNum, amtNum, termNum)}
          disabled={!isReady || !!error}
          className="w-full py-3.5 border-none rounded-full text-[15px] font-semibold cursor-pointer font-body bg-[var(--gold-dark)] text-[var(--parchment)] transition-colors duration-200 hover:bg-[var(--gold-light)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Request Quotes
        </button>
      </div>

      {/* Context Panel */}
      <div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 mb-4 flex flex-col items-center">
          <div className="text-xs text-[var(--text-muted)] mb-4 font-medium uppercase tracking-wide self-start">Loan-to-Value</div>
          <LtvGauge ltv={ltv} />
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 mb-4">
          <div className="text-xs text-[var(--text-muted)] mb-3 font-medium uppercase tracking-wide">Loan Details</div>
          <div className="flex flex-col gap-2.5">
            <DetailRow label="BTC Price" value={formatUsd(btcPrice)} />
            <DetailRow label="Collateral Value" value={collNum > 0 ? formatUsd(collateralValue) : '—'} />
            <DetailRow label="Est. Liquidation Price" value={collNum > 0 && amtNum > 0 ? formatUsd(liqPrice) : '—'} color={collNum > 0 && amtNum > 0 ? 'var(--red-text)' : undefined} />
            <div className="h-px bg-[var(--border)] my-1" />
            <DetailRow label="Liquidation Threshold" value="95% LTV" />
            <DetailRow label="Grace Period" value="7 days" />
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5">
          <div className="text-xs text-[var(--text-muted)] mb-3 font-medium uppercase tracking-wide">Collateral Security</div>
          <div className="flex items-start gap-3 text-[12px] text-[var(--text-secondary)] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-[var(--green)] shrink-0 mt-0.5" />
            <span>BTC is locked in a <span className="text-[var(--text-primary)] font-medium">2-of-3 multisig</span> between you, the lender, and Bound. No single party can move funds alone.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-medium font-headline" style={{ color: color ?? 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
