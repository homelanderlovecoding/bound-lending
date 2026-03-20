'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { ArrowLeft, PenLine, Check, CheckCircle, Clock, Info, Loader2, RefreshCw } from 'lucide-react';
import TopNav from '@/components/TopNav';
import StepIndicator from '@/components/StepIndicator';
import BorrowInputForm from '@/components/BorrowInputForm';
import OfferCard from '@/components/OfferCard';
import LtvGauge from '@/components/LtvGauge';
import ActiveLoansTable from '@/components/ActiveLoansTable';
import { calculateLtv, formatNumber, ltvColor, estLiquidationPrice } from '@/lib/utils';
import { useBtcPrice, useLendingConfig, useRfq, useMyLoans, useAllActiveLoans } from '@/lib/hooks';
import { rfq as rfqApi, loans as loansApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { signPsbt } from '@/lib/psbt';
import MyLoanCard from '@/components/MyLoanCard';
import type { Loan, LoanOffer } from '@/lib/types';

type Tab = 'new-loan' | 'active-loans';

interface RfqData {
  collateral: number;
  amount: number;
  term: number;
}

export default function BorrowPage() {
  const [tab, setTab] = useState<Tab>('new-loan');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rfqData, setRfqData] = useState<RfqData | null>(null);
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<number | null>(null);
  const [loanId, setLoanId] = useState<string | null>(null);
  const [signingState, setSigningState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Wallet context
  const { wallet, btcBalance } = useAuth();

  // Live data from BE
  const { data: priceData, isLoading: priceLoading } = useBtcPrice();
  const { data: lendingConfig, isLoading: configLoading } = useLendingConfig();
  const { data: rfqDetail } = useRfq(rfqId);
  const { data: myLoans } = useMyLoans('borrower');
  const { data: allActiveLoans } = useAllActiveLoans();

  const btcPrice = priceData?.price ?? 0;
  const originationFeePct = lendingConfig?.originationFeePct ?? 0.2;
  const maxLtv = lendingConfig?.maxLtvPct ?? 80;
  const minLoanAmount = lendingConfig?.minLoanAmountUsd ?? 100;
  const minTermDays = lendingConfig?.minLoanTermDays ?? 30;

  // btcBalance comes from auth context (fetched after wallet connect)

  // Real offers from RFQ polling
  const offers = rfqDetail?.offers?.filter((o) => o.status === 'pending') ?? [];

  // ===== Step 1 → 2: Create RFQ =====
  const handleRequestQuotes = async (collateral: number, amount: number, term: number) => {
    setError('');
    setLoading(true);
    try {
      const created = await rfqApi.create({
        collateralBtc: collateral,
        amountUsd: amount,
        termDays: term,
      });
      setRfqData({ collateral, amount, term });
      setRfqId(created._id);
      setStep(2);
      setSelectedOffer(null);
    } catch (err: any) {
      setError(err.message || 'Failed to create RFQ');
    } finally {
      setLoading(false);
    }
  };

  // ===== Step 2 → 3: Accept offer =====
  const handleConfirmOffer = async () => {
    if (selectedOffer === null || !rfqId || !offers[selectedOffer]) return;
    setError('');
    setLoading(true);
    try {
      const res = await rfqApi.accept(rfqId, offers[selectedOffer]._id) as any;
      // Capture loanId from response
      if (res?.loanId) setLoanId(res.loanId);
      setStep(3);
      setSigningState({});
    } catch (err: any) {
      setError(err.message || 'Failed to accept offer');
    } finally {
      setLoading(false);
    }
  };

  // ===== Step 3: Sign origination PSBT =====
  const handleSign = async () => {
    if (!wallet) {
      setError('Connect your wallet first');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // 1. Get the unsigned origination PSBT from BE
      const psbtRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/loans/${loanId}/psbt/origination`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } },
      );
      const psbtJson = await psbtRes.json();
      const psbtHex: string = psbtJson?.data?.psbtHex;
      if (!psbtHex) throw new Error('No PSBT returned from server');

      // 2. Sign with wallet
      setSigningState((s) => ({ ...s, borrower: true }));
      const signedPsbtHex = await signPsbt(wallet.type, psbtHex);

      // 3. Submit signed PSBT to BE
      const submitRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/loans/${loanId}/psbt/origination/sign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify({ signedPsbtHex }),
        },
      );
      const submitJson = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitJson?.message || 'Failed to submit signature');

      // 4. Check if complete (all 3 signed + broadcast)
      if (submitJson?.data?.complete && submitJson?.data?.txid) {
        setSigningState({ borrower: true, lender: true, bound: true });
      } else {
        setSigningState((s) => ({ ...s, borrower: true }));
      }
    } catch (err: any) {
      setError(err.message || 'Signing failed');
      setSigningState({});
    } finally {
      setLoading(false);
    }
  };

  // Cancel RFQ
  const handleCancelRfq = async () => {
    if (!rfqId) return;
    try {
      await rfqApi.cancel(rfqId);
    } catch (e) {
      // ignore
    }
    setStep(1);
    setRfqData(null);
    setRfqId(null);
    setSelectedOffer(null);
  };

  // Computed values for step 2/3
  const offer = selectedOffer !== null ? offers[selectedOffer] : null;
  const fee = rfqData ? rfqData.amount * (originationFeePct / 100) : 0;
  const principal = rfqData ? rfqData.amount + fee : 0;
  const interest = offer && rfqData ? principal * (offer.rateApr / 100) * (rfqData.term / 360) : 0;
  const totalRepay = principal + interest;
  const ltv = rfqData ? calculateLtv(rfqData.amount, rfqData.collateral, btcPrice) : 0;

  // Active loans for tab 2
  const activeLoans = myLoans ?? [];
  const activeStates = ['active', 'grace', 'origination_pending'];
  const filteredActive = activeLoans.filter((l) => activeStates.includes(l.state));
  const totalCollateral = filteredActive.reduce((sum, l) => sum + l.terms.collateralBtc, 0);

  // Loading state
  if (priceLoading || configLoading) {
    return (
      <>
        <TopNav currentPage="borrow" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-[var(--text-muted)]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading market data...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav currentPage="borrow" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Sub tabs */}
        <div className="px-6 pt-4 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
          <div className="max-w-[1120px] mx-auto flex gap-6">
            {(['new-loan', 'active-loans'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'pb-3 text-sm font-semibold bg-transparent border-0 border-b-2 cursor-pointer px-0',
                  tab === t
                    ? 'text-[var(--text-primary)] border-[var(--gold-dark)]'
                    : 'text-[var(--text-muted)] border-transparent',
                )}
              >
                {t === 'new-loan' ? 'New Loan' : 'Active Loans'}
              </button>
            ))}
          </div>
        </div>

        {/* Global error */}
        {error && (
          <div className="max-w-[1120px] mx-auto px-6 pt-4">
            <div className="bg-[rgba(200,50,50,0.1)] border border-[rgba(200,50,50,0.3)] rounded-s px-4 py-3 text-[13px] text-[var(--red-text)] flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-[var(--text-muted)] bg-transparent border-0 cursor-pointer text-xs">✕</button>
            </div>
          </div>
        )}

        {/* ===== New Loan Tab ===== */}
        {tab === 'new-loan' && (
          <div className="max-w-[1120px] mx-auto px-6 py-6">
            {/* Live BTC price banner */}
            <div className="flex items-center justify-between mb-4 text-[12px] text-[var(--text-muted)]">
              <span>BTC/USD: <span className="font-headline font-semibold text-[var(--text-primary)]">${formatNumber(btcPrice, 2)}</span></span>
              <span className="flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Live · updates every 60s
              </span>
            </div>

            <StepIndicator currentStep={step} />

            {/* Step 1: RFQ Input */}
            {step === 1 && (
              <BorrowInputForm
                btcPrice={btcPrice}
                btcBalance={btcBalance}
                maxLtv={maxLtv}
                minLoanAmount={minLoanAmount}
                minTermDays={minTermDays}
                originationFeePct={originationFeePct}
                onRequestQuotes={handleRequestQuotes}
              />
            )}

            {/* Step 2: Offer Selection */}
            {step === 2 && rfqData && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {offers.length > 0 ? `${offers.length} offer${offers.length > 1 ? 's' : ''} received` : 'Waiting for offers...'}
                  </div>
                  <button onClick={handleCancelRfq} className="text-[13px] text-[var(--text-muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--text-primary)] flex items-center gap-1">
                    <ArrowLeft className="w-3.5 h-3.5" /> Cancel RFQ
                  </button>
                </div>

                {offers.length === 0 && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-[var(--gold-dark)]" />
                    <div className="text-sm text-[var(--text-secondary)]">Your RFQ is live — waiting for lender offers</div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">RFQ ID: {rfqId}</div>
                  </div>
                )}

                {offers.length > 0 && (
                  <div className="grid grid-cols-[1fr_340px] gap-6 items-start">
                    <div>
                      <div className="flex flex-col gap-3">
                        {offers.map((o, i) => {
                          const oFee = rfqData.amount * (originationFeePct / 100);
                          const oPrincipal = rfqData.amount + oFee;
                          const oInterest = oPrincipal * (o.rateApr / 100) * (rfqData.term / 360);
                          return (
                            <OfferCard
                              key={o._id}
                              lender={o.lender}
                              rateApr={o.rateApr}
                              originationFeePct={originationFeePct}
                              totalRepay={oPrincipal + oInterest}
                              interestCost={oInterest}
                              selected={selectedOffer === i}
                              onClick={() => setSelectedOffer(i)}
                            />
                          );
                        })}
                      </div>
                      <button
                        onClick={handleConfirmOffer}
                        disabled={selectedOffer === null || loading}
                        className="w-full py-3.5 mt-4 border-none rounded-full text-[15px] font-semibold cursor-pointer font-body bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {selectedOffer === null ? 'Select an offer to continue' : 'Accept Offer'}
                      </button>
                    </div>

                    {/* RFQ Summary */}
                    <div>
                      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 mb-4">
                        <div className="text-xs text-[var(--text-muted)] mb-3 font-medium uppercase tracking-wide">Your RFQ</div>
                        <div className="flex flex-col gap-2">
                          <SummaryRow label="Requesting" value={`${formatNumber(rfqData.amount)} bUSD`} bold />
                          <SummaryRow label="Collateral" value={`${rfqData.collateral.toFixed(6)} BTC`} />
                          <SummaryRow label="Term" value={`${rfqData.term} days`} />
                          <SummaryRow label="Implied LTV" value={`${ltv.toFixed(1)}%`} color={ltvColor(ltv)} />
                        </div>
                      </div>
                      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 flex flex-col items-center">
                        <LtvGauge ltv={ltv} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Origination Pending */}
            {step === 3 && rfqData && offer && (
              <div className="grid grid-cols-[1fr_340px] gap-6 items-start">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">Origination Pending</div>
                    <button onClick={() => setStep(2)} className="text-[13px] text-[var(--text-muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--text-primary)] flex items-center gap-1">
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to offers
                    </button>
                  </div>

                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 mb-4">
                    <div className="text-[13px] text-[var(--text-muted)] mb-4 leading-relaxed">
                      Your loan PSBT requires signatures from all parties. Sign below — the loan activates once confirmed on-chain.
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <SummaryRow label="Loan Amount" value={`${formatNumber(rfqData.amount)} bUSD`} />
                      <SummaryRow label="Origination Fee" value={`${fee.toFixed(2)} bUSD (${originationFeePct}%)`} />
                      <SummaryRow label="Principal Debt" value={`${formatNumber(principal, 2)} bUSD`} bold />
                      <SummaryRow label="Interest Rate" value={`${offer.rateApr}% APR`} />
                      <SummaryRow label="Total Repay" value={`${formatNumber(totalRepay, 2)} bUSD`} bold />
                      <div className="h-px bg-[var(--border)] my-1" />
                      <SummaryRow label="Lender" value={offer.lender} />
                      <SummaryRow label="BTC Collateral" value={`${rfqData.collateral.toFixed(6)} BTC`} />
                      <SummaryRow label="Term" value={`${rfqData.term} days`} />
                      <SummaryRow label="Implied LTV" value={`${ltv.toFixed(1)}%`} />
                      <SummaryRow label="Est. Liquidation Price" value={`$${formatNumber(estLiquidationPrice(principal, rfqData.collateral))}`} color="var(--red-text)" />
                    </div>
                  </div>

                  <button
                    onClick={handleSign}
                    disabled={signingState.borrower}
                    className={clsx(
                      'w-full py-3.5 border-none rounded-full text-[15px] font-semibold cursor-pointer font-body flex items-center justify-center gap-2',
                      signingState.bound
                        ? 'bg-[var(--green-deep)] text-[var(--parchment)]'
                        : signingState.borrower
                          ? 'bg-[var(--green-deep)] text-[var(--parchment)] opacity-70'
                          : 'bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)]',
                    )}
                  >
                    {signingState.bound ? (
                      <><CheckCircle className="w-5 h-5" /> Loan Executed — bUSD deposited to your wallet</>
                    ) : signingState.borrower ? (
                      <><Check className="w-4 h-4" /> Signed — Awaiting Lender &amp; Bound</>
                    ) : (
                      <><PenLine className="w-4 h-4" /> Sign PSBT</>
                    )}
                  </button>
                </div>

                {/* Signing Status */}
                <div>
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5 mb-4">
                    <div className="text-xs text-[var(--text-muted)] mb-4 font-medium uppercase tracking-wide">Signing Status</div>
                    <div className="flex flex-col gap-4">
                      <SignerRow label="You (Borrower)" signed={!!signingState.borrower} active={!signingState.borrower} />
                      <SignerRow label="Lender" signed={!!signingState.lender} active={false} />
                      <SignerRow label="Bound (Co-signer)" signed={!!signingState.bound} active={false} />
                    </div>
                  </div>
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-5">
                    <div className="flex items-start gap-3 text-[12px] text-[var(--text-secondary)] leading-relaxed">
                      <Info className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                      <span>The origination PSBT atomically locks your BTC, disburses bUSD, and routes the origination fee — all in a single on-chain transaction.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== Active Loans Tab ===== */}
        {tab === 'active-loans' && (
          <div className="max-w-[1120px] mx-auto px-6 py-6">
            {/* My Loans — personal cards */}
            {filteredActive.length > 0 && (
              <div className="mb-8">
                <div className="text-sm font-semibold text-[var(--text-primary)] mb-4">My Loans</div>
                <div className="flex gap-4 overflow-x-auto">
                  {filteredActive.map((loan) => (
                    <MyLoanCard
                      key={loan._id}
                      loan={loan}
                      btcPrice={btcPrice}
                      onRepay={(id) => setError('Wallet signing not yet connected — coming soon')}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All Active Loans — platform table */}
            <ActiveLoansTable
              loans={allActiveLoans ?? []}
              totalCount={allActiveLoans?.length ?? 0}
              totalCollateralBtc={(allActiveLoans ?? []).reduce((sum, l) => sum + l.terms.collateralBtc, 0)}
            />
          </div>
        )}
      </div>
    </>
  );
}

function SummaryRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={clsx('font-headline', bold ? 'font-semibold' : 'font-medium')} style={{ color: color ?? 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function SignerRow({ label, signed, active }: { label: string; signed: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          background: signed ? 'rgba(122,143,106,0.15)' : active ? 'rgba(229,154,0,0.15)' : 'var(--bg-tertiary)',
        }}
      >
        {signed ? (
          <CheckCircle className="w-3.5 h-3.5 text-[var(--green)]" />
        ) : active ? (
          <PenLine className="w-3.5 h-3.5 text-[var(--gold)]" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        )}
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
        <div className={clsx('text-[11px]', signed ? 'text-[var(--green)]' : active ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]')}>
          {signed ? 'Signed' : active ? 'Awaiting signature' : 'Pending'}
        </div>
      </div>
    </div>
  );
}
