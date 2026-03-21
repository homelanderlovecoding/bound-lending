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
  verify: (address: string, signature: string, nonce: string, publicKey?: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ address, signature, nonce, ...(publicKey ? { publicKey } : {}) }),
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
  list: () => request<import('./types').Rfq[]>('/rfqs'),
  my: () => request<import('./types').Rfq[]>('/rfqs/my'),
  create: (data: { collateralBtc: number; amountUsd: number; termDays: number; walletBalanceBtc?: number }) =>
    request<import('./types').Rfq>('/rfqs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id: string) => request<import('./types').Rfq>(`/rfqs/${id}`),
  prepareOffer: (rfqId: string, data: { lenderPubkey: string; rateApr: number }) =>
    request<{ psbtHex: string | null; lenderInputCount?: number; borrowerInputCount?: number; reason?: string }>(`/rfqs/${rfqId}/offers/prepare`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  submitOffer: (rfqId: string, data: { lenderPubkey: string; rateApr: number; walletBalanceBusd?: number; lenderUtxos?: { txid: string; vout: number; valueSats: number }[]; signedPsbtHex?: string }) =>
    request<{ data: import('./types').Rfq; message: string }>(`/rfqs/${rfqId}/offers`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  withdrawOffer: (rfqId: string, offerId: string) =>
    request<import('./types').Rfq>(`/rfqs/${rfqId}/offers/${offerId}`, {
      method: 'DELETE',
    }),
  accept: (rfqId: string, offerId: string) =>
    request<{ rfq: import('./types').Rfq; loan?: import('./types').Loan; loanId?: string }>(`/rfqs/${rfqId}/accept`, {
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
  getOriginationPsbt: (id: string) =>
    request<{ loanId: string; psbtHex: string; lenderInputCount: number; borrowerInputCount: number; lenderSigned: boolean; borrowerSigned: boolean }>(`/loans/${id}/psbt/origination`),
  getRepayPsbt: (id: string) =>
    request<{ psbtHex: string }>(`/loans/${id}/psbt/repay`),
  signOrigination: (id: string, signedPsbtHex: string) =>
    request<{ complete: boolean; txid?: string }>(`/loans/${id}/psbt/origination/sign`, {
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
