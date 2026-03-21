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
import { signPsbt } from '@/lib/psbt';
import { useAuth } from '@/lib/auth-context';
import MyLoanCard from '@/components/MyLoanCard';
import LendPanel from '@/components/LendPanel';
import BorrowPanel from '@/components/BorrowPanel';
import type { Loan, LoanOffer } from '@/lib/types';

type Tab = 'new-loan' | 'active-loans';

interface RfqData {
  collateral: number;
  amount: number;
  term: number;
}

export default function BorrowPage() {
  const [tab, setTab] = useState<Tab>('new-loan');
  const [mode, setMode] = useState<'borrow' | 'lend'>('borrow');
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
  const { data: myLoans, mutate: mutateMyLoans } = useMyLoans('borrower', wallet?.address);
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

            {/* Borrow / Lend mode toggle */}
            <div className="flex bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-full p-1 w-fit mb-6">
              {(['borrow', 'lend'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={clsx(
                    'px-5 py-1.5 rounded-full text-[13px] font-semibold border-0 cursor-pointer transition-colors duration-150 capitalize',
                    mode === m
                      ? 'bg-[var(--gold-dark)] text-[var(--parchment)]'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Lend mode */}
            {mode === 'lend' && <LendPanel btcPrice={btcPrice} />}

            {/* Borrow mode */}
            {mode === 'borrow' && <BorrowPanel btcPrice={btcPrice} />}

          </div>
        )}

        {/* ===== Active Loans Tab ===== */}
        {tab === 'active-loans' && (
          <div className="max-w-[1120px] mx-auto px-6 py-6">
            {/* My Loans — personal cards */}
            <div className="mb-8">
              <div className="text-sm font-semibold text-[var(--text-primary)] mb-4">My Loans</div>
              {!wallet ? (
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-6 text-center text-[13px] text-[var(--text-muted)]">
                  Connect your wallet to see your loans
                </div>
              ) : filteredActive.length === 0 ? (
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-s p-6 text-center text-[13px] text-[var(--text-muted)]">
                  No active loans — create a new loan above
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-auto">
                  {filteredActive.map((loan) => (
                    <MyLoanCard
                      key={loan._id}
                      loan={loan}
                      btcPrice={btcPrice}
                      onRepay={async (id) => {
                        if (!wallet) { setError('Connect wallet first'); return; }
                        try {
                          setError('');
                          const psbtData = await loansApi.getRepayPsbt(id);
                          if (!psbtData?.psbtHex) { setError('Failed to get repayment PSBT'); return; }
                          const signed = await signPsbt(wallet.type, psbtData.psbtHex);
                          await loansApi.signRepayment(id, signed);
                          mutateMyLoans();
                        } catch (err: any) {
                          setError(err.message || 'Repayment failed');
                        }
                      }}
                      onSign={async (id) => {
                        if (!wallet) { setError('Connect wallet first'); return; }
                        try {
                          setError('');
                          const psbtData = await loansApi.getOriginationPsbt(id);
                          if (!psbtData?.psbtHex) { setError('No origination PSBT found'); return; }
                          const lenderCount = psbtData.lenderInputCount ?? 0;
                          const borrowerCount = psbtData.borrowerInputCount ?? 0;
                          const borrowerIndices = Array.from({ length: borrowerCount }, (_, i) => lenderCount + i);
                          const signed = await signPsbt(wallet.type, psbtData.psbtHex, {
                            inputsToSign: borrowerIndices.length > 0 ? borrowerIndices : undefined,
                          });
                          await loansApi.signOrigination(id, signed);
                          mutateMyLoans();
                        } catch (err: any) {
                          setError(err.message || 'Signing failed');
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

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
