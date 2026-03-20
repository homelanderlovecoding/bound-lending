const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API Error: ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

// ===== Auth =====
export const auth = {
  challenge: (address: string) =>
    request<{ message: string; nonce: string; expiresAt: string }>('/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),
  verify: (address: string, signature: string, nonce: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ address, signature, nonce }),
    }),
  refresh: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
};

// ===== Price =====
export const price = {
  btc: () => request<{ price: number; currency: string }>('/api/price/btc'),
};

// ===== Config =====
export const config = {
  lending: () =>
    request<import('./types').LendingConfig>('/api/config/lending'),
};

// ===== RFQ =====
export const rfq = {
  create: (data: { collateralBtc: number; amountUsd: number; termDays: number }) =>
    request<import('./types').Rfq>('/rfqs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id: string) => request<import('./types').Rfq>(`/rfqs/${id}`),
  submitOffer: (rfqId: string, data: { lenderPubkey: string; rateApr: number }) =>
    request<import('./types').Rfq>(`/rfqs/${rfqId}/offers`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  withdrawOffer: (rfqId: string, offerId: string) =>
    request<import('./types').Rfq>(`/rfqs/${rfqId}/offers/${offerId}`, {
      method: 'DELETE',
    }),
  accept: (rfqId: string, offerId: string) =>
    request<import('./types').Rfq>(`/rfqs/${rfqId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ offerId }),
    }),
  cancel: (rfqId: string) =>
    request<import('./types').Rfq>(`/rfqs/${rfqId}`, { method: 'DELETE' }),
};

// ===== Loans =====
export const loans = {
  list: (params?: { role?: string; status?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<import('./types').Loan[]>(`/loans${query ? `?${query}` : ''}`);
  },
  active: () => request<import('./types').Loan[]>('/loans/active'),
  get: (id: string) => request<import('./types').Loan>(`/loans/${id}`),
  repaymentQuote: (id: string) =>
    request<import('./types').RepaymentQuote>(`/loans/${id}/repayment-quote`),
  signOrigination: (id: string, signedPsbtHex: string) =>
    request(`/loans/${id}/psbt/origination/sign`, {
      method: 'POST',
      body: JSON.stringify({ signedPsbtHex }),
    }),
  signRepayment: (id: string, signedPsbtHex: string) =>
    request(`/loans/${id}/psbt/repay/sign`, {
      method: 'POST',
      body: JSON.stringify({ signedPsbtHex }),
    }),
};

// ===== Dashboard =====
export const dashboard = {
  summary: () => request<import('./types').DashboardSummary>('/dashboard/summary'),
  loans: () => request<import('./types').Loan[]>('/dashboard/loans'),
};
