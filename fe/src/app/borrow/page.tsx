'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, PenLine, Check, CheckCircle, Clock, Info } from 'lucide-react';
import TopNav from '@/components/TopNav';
import StepIndicator from '@/components/StepIndicator';
import BorrowInputForm from '@/components/BorrowInputForm';
import OfferCard from '@/components/OfferCard';
import LtvGauge from '@/components/LtvGauge';
import ActiveLoansTable from '@/components/ActiveLoansTable';
import { calculateLtv, formatNumber, ltvColor, estLiquidationPrice } from '@/lib/utils';

// MVP: Mock data — replace with API calls
const BTC_PRICE = 91183.76;
const BTC_BALANCE = 2.031109;
const ORIGINATION_FEE_PCT = 0.2;
const MOCK_OFFERS = [
  { lender: 'Ledn', rateApr: 5.2 },
  { lender: 'Unchained Capital', rateApr: 4.8 },
  { lender: 'SALT Lending', rateApr: 6.1 },
];

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
  const [selectedOffer, setSelectedOffer] = useState<number | null>(null);
  const [signingState, setSigningState] = useState<Record<string, boolean>>({});

  // ===== Step 1 → 2 =====
  const handleRequestQuotes = (collateral: number, amount: number, term: number) => {
    setRfqData({ collateral, amount, term });
    setStep(2);
    setSelectedOffer(null);
  };

  // ===== Step 2 → 3 =====
  const handleConfirmOffer = () => {
    if (selectedOffer === null) return;
    setStep(3);
    setSigningState({});
  };

  // ===== Sign simulation =====
  const handleSign = () => {
    setSigningState({ borrower: true });
    setTimeout(() => setSigningState((s) => ({ ...s, lender: true })), 1200);
    setTimeout(() => setSigningState((s) => ({ ...s, bound: true })), 2400);
    setTimeout(() => {
      setStep(1);
      setRfqData(null);
      setSelectedOffer(null);
      setSigningState({});
    }, 5500);
  };

  // Computed values for step 2/3
  const offer = selectedOffer !== null ? MOCK_OFFERS[selectedOffer] : null;
  const fee = rfqData ? rfqData.amount * (ORIGINATION_FEE_PCT / 100) : 0;
  const principal = rfqData ? rfqData.amount + fee : 0;
  const interest = offer && rfqData ? principal * (offer.rateApr / 100) * (rfqData.term / 360) : 0;
  const totalRepay = principal + interest;
  const ltv = rfqData ? calculateLtv(rfqData.amount, rfqData.collateral, BTC_PRICE) : 0;

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

        {/* ===== New Loan Tab ===== */}
        {tab === 'new-loan' && (
          <div className="max-w-[1120px] mx-auto px-6 py-6">
            <StepIndicator currentStep={step} />

            {/* Step 1: RFQ Input */}
            {step === 1 && (
              <BorrowInputForm
                btcPrice={BTC_PRICE}
                btcBalance={BTC_BALANCE}
                maxLtv={80}
                minLoanAmount={100}
                minTermDays={30}
                originationFeePct={ORIGINATION_FEE_PCT}
                onRequestQuotes={handleRequestQuotes}
              />
            )}

            {/* Step 2: Offer Selection */}
            {step === 2 && rfqData && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{MOCK_OFFERS.length} offers received</div>
                  <button onClick={() => setStep(1)} className="text-[13px] text-[var(--text-muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--text-primary)] flex items-center gap-1">
                    <ArrowLeft className="w-3.5 h-3.5" /> Edit RFQ
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_340px] gap-6 items-start">
                  <div>
                    <div className="flex flex-col gap-3">
                      {MOCK_OFFERS.map((o, i) => {
                        const oFee = rfqData.amount * (ORIGINATION_FEE_PCT / 100);
                        const oPrincipal = rfqData.amount + oFee;
                        const oInterest = oPrincipal * (o.rateApr / 100) * (rfqData.term / 360);
                        return (
                          <OfferCard
                            key={i}
                            lender={o.lender}
                            rateApr={o.rateApr}
                            originationFeePct={ORIGINATION_FEE_PCT}
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
                      disabled={selectedOffer === null}
                      className="w-full py-3.5 mt-4 border-none rounded-full text-[15px] font-semibold cursor-pointer font-body bg-[var(--gold-dark)] text-[var(--parchment)] hover:bg-[var(--gold-light)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {selectedOffer === null ? 'Select an offer to continue' : 'Continue'}
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
                      <SummaryRow label="Origination Fee" value={`${fee.toFixed(2)} bUSD (${ORIGINATION_FEE_PCT}%)`} />
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
            {/* TODO: Replace with real API data */}
            <ActiveLoansTable loans={[]} totalCount={0} totalCollateralBtc={0} />
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
