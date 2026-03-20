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
export function useOpenRfqs() {
  return useSWR<Rfq[]>(
    'open-rfqs',
    () => rfq.list(),
    { refreshInterval: 10_000 },
  );
}

export function useMyRfqs(address?: string) {
  return useSWR<Rfq[]>(
    address ? `my-rfqs-${address}` : null,
    () => rfq.my(),
    { refreshInterval: 5_000 },
  );
}

export function useRfq(id: string | null) {
  return useSWR<Rfq>(
    id ? `rfq-${id}` : null,
    () => rfq.get(id!),
    { refreshInterval: 5_000 },
  );
}

// ===== Loans =====
export function useMyLoans(role?: string, address?: string) {
  // Include address in key so SWR refetches when wallet connects
  return useSWR<Loan[]>(
    address ? `my-loans-${role ?? 'all'}-${address}` : null,
    () => loans.list(role ? { role } : undefined),
    { refreshInterval: 15_000 },
  );
}

export function useAllActiveLoans() {
  return useSWR<Loan[]>(
    'all-active-loans',
    () => loans.active(),
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
