'use client';

import useSWR from 'swr';
import { price, config, loans, dashboard, rfq } from './api';
import type { LendingConfig, Loan, DashboardSummary, Rfq } from './types';

// ===== Price =====
export function useBtcPrice(refreshInterval = 60_000) {
  return useSWR<{ price: number; currency: string }>(
    'btc-price',
    () => price.btc(),
    { refreshInterval, dedupingInterval: 10_000 },
  );
}

// ===== Config =====
export function useLendingConfig() {
  return useSWR<LendingConfig>(
    'lending-config',
    () => config.lending(),
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
}

// ===== RFQ =====
export function useRfq(id: string | null) {
  return useSWR<Rfq>(
    id ? `rfq-${id}` : null,
    () => rfq.get(id!),
    { refreshInterval: 5_000 },
  );
}

// ===== Loans =====
export function useMyLoans(role?: string) {
  return useSWR<Loan[]>(
    `my-loans-${role ?? 'all'}`,
    () => loans.list(role ? { role } : undefined),
    { refreshInterval: 15_000 },
  );
}

export function useLoan(id: string | null) {
  return useSWR<Loan>(
    id ? `loan-${id}` : null,
    () => loans.get(id!),
    { refreshInterval: 5_000 },
  );
}

// ===== Dashboard =====
export function useDashboardSummary() {
  return useSWR<DashboardSummary>(
    'dashboard-summary',
    () => dashboard.summary(),
    { refreshInterval: 30_000 },
  );
}

export function useDashboardLoans() {
  return useSWR<Loan[]>(
    'dashboard-loans',
    () => dashboard.loans(),
    { refreshInterval: 15_000 },
  );
}
