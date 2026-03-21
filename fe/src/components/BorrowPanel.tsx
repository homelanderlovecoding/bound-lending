'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Clock, ChevronDown, ChevronUp, Loader2, X, Check } from 'lucide-react';
import { formatNumber, calculateLtv, ltvColor } from '@/lib/utils';
import { useMyRfqs } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { rfq as rfqApi, loans as loansApi } from '@/lib/api';
import { signPsbt } from '@/lib/psbt';
import { useBtcPrice, useLendingConfig } from '@/lib/hooks';
import BorrowInputForm from './BorrowInputForm';
import type { Rfq, LoanOffer } from '@/lib/types';

interface BorrowPanelProps {
  btcPrice: number;
  onLoanCreated?: (loanId: string) => void;
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function statusBadge(status: string, offerCount: number) {
  if (status === 'selected') return { label: 'Accepted', bg: 'rgba(122,143,106,0.2)', color: 'var(--green)' };
  if (status === 'offers_received') return { label: `${offerCount} offer${offerCount !== 1 ? 's' : ''}`, bg: 'rgba(229,154,0,0.2)', color: 'var(--gold)' };
  return { label: 'Waiting…', bg: 'rgba(125,128,135,0.15)', color: 'var(--text-muted)' };
}

// ===== Modal =====
function NewRfqModal({
  btcPrice,
  availableBalance,
  lendingConfig,
  onClose,
  onCreated,
}: {
  btcPrice: number;
  availableBalance: number;
  lendingConfig: any;
  onClose: () => void;
  onCreated: (rfq: Rfq) => void;
}) {
  const { btcBalance, wallet } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (collateral: number, amount: number, term: number) => {
    setError('');
    setLoading(true);
    try {
      const created = await rfqApi.create({
        collateralBtc: collateral,
        amountUsd: amount,
        termDays: term,
        walletBalanceBtc: btcBalance,
      });
      onCreated(created);
    } catch (err: any) {
      setError(err.message || 'Failed to create RFQ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto py-8" onClick={onClose}>
      <div
        className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-s w-full max-w-[900px] mx-4 shadow-[0_16px_48px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">New Loan Request</h3>
          <button onClick={onClose} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          {availableBalance < btcBalance && (
            <div className="bg-[rgba(229,154,0,0.1)] border border-[rgba(229,154,0,0.3)] rounded-s px-4 py-2.5 text-[12px] text-[var(--gold)] mb-4">
              ⚠️ Available balance: {availableBalance.toFixed(6)} BTC (some is reserved by open RFQs)
            </div>
          )}
          {error && (
            <div className="bg-[rgba(200,50,50,0.1)] border border-[rgba(200,50,50,0.3)] rounded-s px-4 py-2.5 text-[12px] text-[var(--red-text)] mb-4 flex justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="bg-transparent border-0 cursor-pointer text-[var(--text-muted)] text-xs">✕</button>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--gold-dark)]" />
            </div>
          ) : (
            <BorrowInputForm
              btcPrice={btcPrice}
              btcBalance={availableBalance}
              maxLtv={lendingConfig?.maxLtvPct ?? 80}
              minLoanAmount={lendingConfig?.minLoanAmountUsd ?? 100}
              minTermDays={lendingConfig?.minLoanTermDays ?? 30}
              originationFeePct={lendingConfig?.originationFeePct ?? 0.2}
              onRequestQuotes={handleCreate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Offers Drawer =====
function OffersDrawer({
  rfq,
  onClose,
  onAccepted,
}: {
  rfq: Rfq;
  onClose: () => void;
  onAccepted: (loanId: string) => void;
}) {
  const { wallet } = useAuth();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [signStatus, setSignStatus] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pendingOffers = rfq.offers?.filter((o) => o.status === 'pending') ?? [];

  const handleAccept = async (offerId: string) => {
    setError('');
    setAccepting(offerId);
    try {
      // 1. Accept offer → creates loan
      setSignStatus('Accepting offer...');
      const res = await rfqApi.accept(rfq._id, offerId) as any;
      const loanId = res?.loanId;
      if (!loanId) { onClose(); return; }

      // 2. Get origination PSBT (may already have lender signature)
      setSignStatus('Loading origination PSBT...');
      const psbtData = await loansApi.getOriginationPsbt(loanId);
      if (!psbtData?.psbtHex) {
        onAccepted(loanId);
        return;
      }

      // 3. Borrower signs their inputs
      if (wallet) {
        setSignStatus('Sign the origination PSBT in your wallet...');
        const lenderCount = psbtData.lenderInputCount ?? 0;
        const borrowerCount = psbtData.borrowerInputCount ?? 0;
        const borrowerIndices = Array.from({ length: borrowerCount }, (_, i) => lenderCount + i);

        const signedHex = await signPsbt(wallet.type, psbtData.psbtHex, {
          inputsToSign: borrowerIndices.length > 0 ? borrowerIndices : undefined,
        });

        // 4. Submit signature
        setSignStatus('Broadcasting transaction...');
        const result = await loansApi.signOrigination(loanId, signedHex);
        if (result?.txid) {
          setSignStatus(`Loan active! TX: ${result.txid.slice(0, 12)}...`);
        }
      }

      onAccepted(loanId);
    } catch (err: any) {
      setError(err.message || 'Failed to accept offer');
    } finally {
      setAccepting(null);
      setSignStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s w-full max-w-[480px] mx-4 shadow-[0_16px_48px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Offers for #{rfq._id.slice(-4).toUpperCase()}
            </h3>
            <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
              {formatNumber(rfq.amountUsd)} bUSD · {rfq.collateralBtc.toFixed(4)} BTC · {rfq.termDays}d
            </div>
          </div>
          <button onClick={onClose} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="bg-[rgba(200,50,50,0.1)] border border-[rgba(200,50,50,0.3)] rounded-s px-3 py-2 text-[12px] text-[var(--red-text)] mb-4">
              {error}
            </div>
          )}

          {pendingOffers.length === 0 ? (
            <div className="text-center py-6 text-[13px] text-[var(--text-muted)]">
              No offers yet — lenders are reviewing your RFQ
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingOffers
                .slice()
                .sort((a, b) => a.rateApr - b.rateApr) // best rate first
                .map((offer) => {
                  const interest = rfq.amountUsd * (offer.rateApr / 100) * (rfq.termDays / 360);
                  const totalRepay = rfq.amountUsd + interest;
                  const isBest = offer === pendingOffers.slice().sort((a, b) => a.rateApr - b.rateApr)[0];
                  return (
                    <div
                      key={offer._id}
                      className={clsx(
                        'border rounded-s p-4',
                        isBest ? 'border-[var(--gold-dark)] bg-[rgba(229,154,0,0.05)]' : 'border-[var(--border)] bg-[var(--bg-tertiary)]',
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold font-headline text-[var(--text-primary)]">
                            {offer.rateApr}% APR
                          </span>
                          {isBest && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(229,154,0,0.2)] text-[var(--gold)]">
                              Best rate
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] text-[var(--text-muted)]">
                          Repay {formatNumber(totalRepay, 2)} bUSD
                        </span>
                      </div>
                      <button
                        onClick={() => handleAccept(offer._id)}
                        disabled={!!accepting}
                        className="w-full py-2.5 border-none rounded-full text-[13px] font-semibold cursor-pointer bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)] disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {accepting === offer._id ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {signStatus || 'Accepting…'}</>
                        ) : (
                          <><Check className="w-3.5 h-3.5" /> Accept this offer</>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Main BorrowPanel =====
export default function BorrowPanel({ btcPrice, onLoanCreated }: BorrowPanelProps) {
  const { wallet, btcBalance } = useAuth();
  const { data: lendingConfig } = useLendingConfig();
  const { data: myRfqs, mutate } = useMyRfqs(wallet?.address);
  const [showModal, setShowModal] = useState(false);
  const [selectedRfq, setSelectedRfq] = useState<Rfq | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const rfqs = myRfqs ?? [];
  const usedBtc = rfqs.reduce((sum, r) => sum + (r.status !== 'selected' ? r.collateralBtc : 0), 0);
  const availableBalance = Math.max(0, btcBalance - usedBtc);

  const handleCancel = async (rfqId: string) => {
    setCancelling(rfqId);
    try {
      await rfqApi.cancel(rfqId);
      mutate();
    } catch (e) { /* ignore */ }
    finally { setCancelling(null); }
  };

  const handleCreated = (newRfq: Rfq) => {
    setShowModal(false);
    mutate();
  };

  const handleAccepted = (loanId: string) => {
    setSelectedRfq(null);
    mutate();
    onLoanCreated?.(loanId);
  };

  if (!wallet) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-8 text-center">
        <div className="text-[14px] text-[var(--text-muted)]">Connect your wallet to start borrowing</div>
      </div>
    );
  }

  return (
    <div>
      {/* BTC balance summary */}
      <div className="flex items-center justify-between mb-5">
        <div className="text-[13px] text-[var(--text-muted)]">
          Wallet: <span className="font-headline font-semibold text-[var(--text-primary)]">{btcBalance.toFixed(6)} BTC</span>
          {usedBtc > 0 && (
            <span className="ml-2 text-[var(--gold)]">
              · {usedBtc.toFixed(6)} reserved · <span className="text-[var(--text-primary)]">{availableBalance.toFixed(6)} available</span>
            </span>
          )}
        </div>

        {/* Big CTA */}
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--gold-dark)] border-0 text-[var(--parchment)] rounded-full text-[14px] font-semibold cursor-pointer hover:bg-[var(--gold-light)] transition-colors duration-150"
        >
          <Plus className="w-4 h-4" />
          New Loan Request
        </button>
      </div>

      {/* RFQ list */}
      {rfqs.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-8 text-center">
          <div className="text-[13px] text-[var(--text-muted)] mb-3">No pending loan requests</div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--gold-dark)] border-0 text-[var(--parchment)] rounded-full text-[13px] font-semibold cursor-pointer hover:bg-[var(--gold-light)]"
          >
            <Plus className="w-3.5 h-3.5" /> Create your first request
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rfqs.map((r) => {
            const badge = statusBadge(r.status, r.offers?.filter(o => o.status === 'pending').length ?? 0);
            const ltv = r.impliedLtv ?? calculateLtv(r.amountUsd, r.collateralBtc, btcPrice);
            const isCancelling = cancelling === r._id;

            return (
              <div
                key={r._id}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold font-headline text-[var(--gold-dark)]">
                      #{r._id.slice(-4).toUpperCase()}
                    </span>
                    <span
                      className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {timeLeft(r.expiresAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.status !== 'selected' && (
                      <>
                        {(r.offers?.filter(o => o.status === 'pending').length ?? 0) > 0 && (
                          <button
                            onClick={() => setSelectedRfq(r)}
                            className="px-4 py-1.5 rounded-full text-[12px] font-semibold border-0 cursor-pointer bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)]"
                          >
                            View Offers
                          </button>
                        )}
                        <button
                          onClick={() => handleCancel(r._id)}
                          disabled={isCancelling}
                          className="px-4 py-1.5 rounded-full text-[12px] font-semibold border border-[var(--border)] bg-transparent text-[var(--text-muted)] cursor-pointer hover:text-[var(--red-text)] hover:border-[var(--red-text)] disabled:opacity-50"
                        >
                          {isCancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Cancel'}
                        </button>
                      </>
                    )}
                    {r.status === 'selected' && (
                      <span className="text-[12px] text-[var(--green)]">✓ Offer accepted</span>
                    )}
                  </div>
                </div>

                {/* RFQ details row */}
                <div className="flex gap-6 mt-3 pt-3 border-t border-[var(--border)]">
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Amount</div>
                    <div className="text-[13px] font-semibold font-headline text-[var(--text-primary)]">{formatNumber(r.amountUsd)} bUSD</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Collateral</div>
                    <div className="text-[13px] font-semibold font-headline text-[var(--text-primary)]">{r.collateralBtc.toFixed(4)} BTC</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Term</div>
                    <div className="text-[13px] font-semibold font-headline text-[var(--text-primary)]">{r.termDays}d</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">LTV</div>
                    <div className="text-[13px] font-semibold font-headline" style={{ color: ltvColor(ltv) }}>{ltv.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New RFQ Modal */}
      {showModal && (
        <NewRfqModal
          btcPrice={btcPrice}
          availableBalance={availableBalance}
          lendingConfig={lendingConfig}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Offers Drawer */}
      {selectedRfq && (
        <OffersDrawer
          rfq={selectedRfq}
          onClose={() => setSelectedRfq(null)}
          onAccepted={handleAccepted}
        />
      )}
    </div>
  );
}
