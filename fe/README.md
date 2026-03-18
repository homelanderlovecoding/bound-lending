# Bound Lending — Frontend

Next.js frontend for the BTC-collateralized lending platform.

## Quick Start

```bash
npm install
npm run dev            # http://localhost:3001
```

Set the API URL in `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Stack

- **Next.js 14** — App Router, SSR
- **React 18** — UI
- **Tailwind CSS** — styling (dark/light theme via CSS variables)
- **Lucide React** — icons
- **SWR** — data fetching (planned)
- **TypeScript** — strict mode

## Pages

| Route | Description |
|-------|-------------|
| `/` | Redirects to `/borrow` |
| `/borrow` | Main borrow page (New Loan + Active Loans tabs) |

## Borrow Flow (3-step)

1. **RFQ Input** — Enter collateral (BTC), loan amount (bUSD), term (days). Real-time LTV gauge, est. liquidation price, validation.
2. **Offer Selection** — View lender offers (APR, fees, total repay). Select and continue.
3. **Origination Signing** — Review loan summary, sign PSBT. Track 3-party signing status (Borrower → Lender → Bound).

## Components

| Component | Description |
|-----------|-------------|
| `TopNav` | Navigation bar with logo, links, More dropdown, theme toggle |
| `BorrowInputForm` | Step 1 — collateral, amount, term inputs + context panel |
| `OfferCard` | Lender offer card (APR, fees, total repay) |
| `LtvGauge` | Animated conic-gradient LTV gauge (0-95% range) |
| `StepIndicator` | 3-step progress indicator (RFQ → Offers → Sign) |
| `ActiveLoansTable` | Sortable loan table with status badges |

## API Client

`src/lib/api.ts` — typed API client covering all BE endpoints:

```typescript
import { auth, rfq, loans, price, config, dashboard } from '@/lib/api';

// Auth
const { message, nonce } = await auth.challenge(address);
const { accessToken } = await auth.verify(address, signature, nonce);

// RFQ
const newRfq = await rfq.create({ collateralBtc: 0.5, amountUsd: 25000, termDays: 90 });
const rfqDetail = await rfq.get(newRfq._id);

// Loans
const myLoans = await loans.list({ role: 'borrower' });
const quote = await loans.repaymentQuote(loanId);

// Price & Config
const { price: btcPrice } = await price.btc();
const lendingConfig = await config.lending();
```

## Theme

Dark mode by default. Toggle with the sun/moon button in TopNav. Uses CSS custom properties:

| Variable | Dark | Light |
|----------|------|-------|
| `--bg-primary` | `#0E0F10` | `#F7F7F7` |
| `--bg-secondary` | `#141517` | `#FFFFFF` |
| `--text-primary` | `#F3F3F3` | `#262626` |
| `--gold-dark` | `#E59A00` | `#E59A00` |

## Project Structure

```
src/
├── app/
│   ├── layout.tsx         — Root layout (fonts, globals)
│   ├── page.tsx           — Redirect to /borrow
│   ├── globals.css        — CSS variables, Tailwind, custom styles
│   └── borrow/
│       └── page.tsx       — Main borrow page (all 3 steps + active loans)
├── components/            — Reusable UI components
├── lib/
│   ├── api.ts             — Typed API client
│   ├── types.ts           — TypeScript types (matches BE schemas)
│   └── utils.ts           — LTV calc, formatting, color helpers
└── hooks/                 — Custom React hooks (planned)
```

## Build

```bash
npm run build          # Production build
npm start              # Start production server
npm run lint           # ESLint
```
