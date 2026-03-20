'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Loader2, ChevronRight, Clock, Bitcoin } from 'lucide-react';
import { formatNumber, formatUsd, calculateLtv, ltvColor } from '@/lib/utils';
import { useOpenRfqs } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { rfq as rfqApi } from '@/lib/api';
import type { Rfq } from '@/lib/types';

interface LendPanelProps {
  btcPrice: number;
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export default function LendPanel({ btcPrice }: LendPanelProps) {
  const { wallet } = useAuth();
  const { data: openRfqs, isLoading, mutate } = useOpenRfqs();
  const [selectedRfq, setSelectedRfq] = useState<Rfq | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Find if current user already has an offer on selected RFQ
  const myExistingOffer = selectedRfq && wallet
    ? selectedRfq.offers?.find((o) => o.lender === wallet.address && o.status === 'pending')
    : null;

  // Pre-fill rate if editing
  const [rateApr, setRateApr] = useState('');
  
  const handleSubmitOffer = async () => {
    if (!wallet) { setError('Connect your wallet to submit an offer'); return; }
    if (!selectedRfq || !rateApr) return;
    const rate = parseFloat(rateApr);
    if (isNaN(rate) || rate <= 0 || rate > 100) { setError('Invalid APR — enter a value between 0.1 and 100'); return; }

    setError('');
    setSubmitting(true);
    try {
      const res = await rfqApi.submitOffer(selectedRfq._id, { lenderPubkey: wallet.publicKey, rateApr: rate });
      const msg = (res as any)?.message ?? (myExistingOffer ? 'Offer updated' : 'Offer submitted');
      setSuccess(`${msg} at ${rate}% APR`);
      setSelectedRfq(null);
      setRateApr('');
      mutate();
    } catch (err: any) {
      setError(err.message || 'Failed to submit offer');
    } finally {
      setSubmitting(false);
    }
  };

  // No early return when not connected — show RFQs but gate the submit action

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--gold-dark)]" />
      </div>
    );
  }

  const rfqs = openRfqs ?? [];

  return (
    <div className="grid grid-cols-[1fr_360px] gap-6 items-start">
      {/* Left — RFQ list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            Open RFQs <span className="text-[var(--text-muted)] font-normal ml-1">({rfqs.length})</span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">Updates every 10s</div>
        </div>

        {rfqs.length === 0 ? (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-8 text-center text-[13px] text-[var(--text-muted)]">
            No open RFQs right now — check back soon
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rfqs.map((r) => {
              const ltv = r.impliedLtv ?? calculateLtv(r.amountUsd, r.collateralBtc, btcPrice);
              const isSelected = selectedRfq?._id === r._id;
              return (
                <button
                  key={r._id}
                  onClick={() => setSelectedRfq(isSelected ? null : r)}
                  className={clsx(
                    'w-full text-left bg-[var(--bg-secondary)] border rounded-s p-4 cursor-pointer transition-colors duration-150',
                    isSelected
                      ? 'border-[var(--gold-dark)] bg-[rgba(229,154,0,0.05)]'
                      : 'border-[var(--border)] hover:border-[var(--border-light)]',
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold font-headline text-[var(--gold-dark)]">
                        #{r._id.slice(-4).toUpperCase()}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(122,143,106,0.2)] text-[var(--green)]">
                        Open
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {timeLeft(r.expiresAt)}
                      </span>
                    </div>
                    <ChevronRight className={clsx('w-4 h-4 text-[var(--text-muted)] transition-transform', isSelected && 'rotate-90')} />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Requesting</div>
                      <div className="text-[13px] font-semibold font-headline text-[var(--text-primary)]">
                        {formatNumber(r.amountUsd)} bUSD
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Collateral</div>
                      <div className="text-[13px] font-semibold font-headline text-[var(--text-primary)]">
                        {r.collateralBtc.toFixed(4)} BTC
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">≈ {formatUsd(r.collateralBtc * btcPrice)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Term / LTV</div>
                      <div className="text-[13px] font-semibold font-headline text-[var(--text-primary)]">
                        {r.termDays}d
                      </div>
                      <div className="text-[11px] font-medium" style={{ color: ltvColor(ltv) }}>
                        {ltv.toFixed(1)}% LTV
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const myOffer = wallet ? r.offers?.find(o => o.lender === wallet.address && o.status === 'pending') : null;
                    const otherOffers = r.offers?.filter(o => o.status === 'pending').length ?? 0;
                    return (
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        {myOffer && (
                          <span className="text-[var(--green)]">✓ Your offer: {myOffer.rateApr}% APR</span>
                        )}
                        {otherOffers > 0 && !myOffer && (
                          <span className="text-[var(--text-muted)]">{otherOffers} offer(s) submitted</span>
                        )}
                        {otherOffers > 1 && myOffer && (
                          <span className="text-[var(--text-muted)]">· {otherOffers - 1} other offer(s)</span>
                        )}
                      </div>
                    );
                  })()}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right — Submit offer panel */}
      <div>
        {success && (
          <div className="bg-[rgba(122,143,106,0.15)] border border-[rgba(122,143,106,0.3)] rounded-s px-4 py-3 text-[13px] text-[var(--green)] mb-4 flex items-center justify-between">
            <span>✓ {success}</span>
            <button onClick={() => setSuccess('')} className="text-[var(--text-muted)] bg-transparent border-0 cursor-pointer text-xs">✕</button>
          </div>
        )}

        {error && (
          <div className="bg-[rgba(200,50,50,0.1)] border border-[rgba(200,50,50,0.3)] rounded-s px-4 py-3 text-[13px] text-[var(--red-text)] mb-4 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-[var(--text-muted)] bg-transparent border-0 cursor-pointer text-xs">✕</button>
          </div>
        )}

        {!selectedRfq ? (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-6 text-center">
            <Bitcoin className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
            {!wallet ? (
              <div className="text-[13px] text-[var(--text-muted)]">
                Connect your wallet to submit offers
              </div>
            ) : (
              <div className="text-[13px] text-[var(--text-muted)]">Select an RFQ to submit your offer</div>
            )}
          </div>
        ) : !wallet ? (
          // RFQ selected but not connected — prompt to connect
          <div className="bg-[var(--bg-secondary)] border border-[var(--gold-dark)] rounded-s p-5 text-center">
            <div className="text-[14px] font-semibold text-[var(--text-primary)] mb-2">
              #{selectedRfq._id.slice(-4).toUpperCase()} — {formatNumber(selectedRfq.amountUsd)} bUSD · {selectedRfq.termDays}d
            </div>
            <div className="text-[13px] text-[var(--text-muted)] mb-4">
              Connect your wallet to submit an offer on this RFQ
            </div>
            <button
              onClick={() => setError('Use the "Connect Wallet" button in the top navigation')}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold border-0 cursor-pointer bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)]"
            >
              Connect Wallet to Lend
            </button>
          </div>
        ) : (
          <div className="bg-[var(--bg-secondary)] border border-[var(--gold-dark)] rounded-s p-5">
            <div className="text-xs text-[var(--text-muted)] mb-3 font-medium uppercase tracking-wide">
              Submit Offer — #{selectedRfq._id.slice(-4).toUpperCase()}
            </div>

            {/* RFQ summary */}
            <div className="flex flex-col gap-2 mb-5">
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--text-muted)]">Loan amount</span>
                <span className="font-headline font-semibold text-[var(--text-primary)]">{formatNumber(selectedRfq.amountUsd)} bUSD</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--text-muted)]">Collateral</span>
                <span className="font-headline text-[var(--text-primary)]">{selectedRfq.collateralBtc.toFixed(6)} BTC</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--text-muted)]">Term</span>
                <span className="font-headline text-[var(--text-primary)]">{selectedRfq.termDays} days</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--text-muted)]">LTV</span>
                <span className="font-headline" style={{ color: ltvColor(selectedRfq.impliedLtv ?? 0) }}>
                  {(selectedRfq.impliedLtv ?? 0).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Existing offer banner */}
            {myExistingOffer && (
              <div className="bg-[rgba(122,143,106,0.12)] border border-[rgba(122,143,106,0.3)] rounded-s px-3 py-2.5 text-[12px] text-[var(--green)] mb-4 flex items-center justify-between">
                <span>Your current offer: <strong>{myExistingOffer.rateApr}% APR</strong></span>
                <span className="text-[11px] text-[var(--text-muted)]">Adjust below to update</span>
              </div>
            )}

            {/* APR input */}
            <div className="mb-4">
              <div className="text-xs text-[var(--text-muted)] mb-2 font-medium uppercase tracking-wide">
                {myExistingOffer ? 'New Rate (APR)' : 'Your Rate (APR)'}
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={rateApr}
                  onChange={(e) => setRateApr(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={myExistingOffer ? `Current: ${myExistingOffer.rateApr}%` : 'e.g. 5.0'}
                  className="w-full py-3 pl-4 pr-12 text-xl font-semibold font-headline text-[var(--text-primary)] bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-s outline-none focus:border-[var(--gold-dark)]"
                />
                <span className="absolute right-4 text-sm font-semibold text-[var(--text-muted)] pointer-events-none">%</span>
              </div>
              {rateApr && !isNaN(parseFloat(rateApr)) && selectedRfq && (
                <div className="text-[11px] text-[var(--text-muted)] mt-1.5">
                  Borrower repays ≈ {formatNumber(
                    (selectedRfq.amountUsd * (1 + parseFloat(rateApr) / 100 * selectedRfq.termDays / 360)),
                    2
                  )} bUSD
                </div>
              )}
            </div>

            <button
              onClick={handleSubmitOffer}
              disabled={!rateApr || submitting}
              className="w-full py-3.5 border-none rounded-full text-[15px] font-semibold cursor-pointer font-body bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {myExistingOffer ? 'Update Offer' : 'Submit Offer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
