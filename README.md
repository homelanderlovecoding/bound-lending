# Bound Lending

BTC-collateralized, fixed-term, fixed-rate lending platform. Borrowers lock BTC in a 2-of-3 multisig escrow and receive bUSD. Repay before deadline → get BTC back. Don't → lender claims BTC.

**Three parties:** Borrower, Lender, Bound (coordinator/co-signer)

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | NestJS (Node.js/TypeScript) | Modular DI framework + best Bitcoin lib ecosystem |
| DB | MongoDB | Flexible schema for RFQs/offers/loan lifecycle |
| Cache/Queue | Redis + BullMQ (@nestjs/bullmq) | Timer jobs, price cache, PSBT expiry |
| Realtime | WebSocket (@nestjs/websockets) | RFQ feed + loan events |
| Price Feeds | CoinMarketCap, CoinGecko, Binance, Hyperliquid, +1 TBD | 5-source median for liquidation |
| Bitcoin | bitcoinjs-lib + Bitcoin Core RPC + mempool.space | Multisig, PSBT, chain monitoring |
| Frontend | Next.js | Borrower UI + lender dashboard |
| Wallet | Bound Trading Wallet SDK | Required — no external wallets |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              Frontend (Next.js)                       │
│  Borrower: /borrow  /rfq/:id  /loan/:id  /dashboard  │
│  Lender:   /lend    /offers   /loan/:id  /dashboard   │
└──────────┬────────────────────────┬───────────────────┘
           │ REST                   │ WebSocket
           ▼                        ▼
┌──────────────────────────────────────────────────────┐
│              API Gateway (NestJS)                      │
│         Guards: JwtAuth, ApiKey, Roles                │
└───┬──────┬──────┬──────┬──────┬──────┬───────────────┘
    │      │      │      │      │      │
    ▼      ▼      ▼      ▼      ▼      ▼
┌──────┐┌─────┐┌──────┐┌──────┐┌──────┐┌───────────┐
│ Auth ││ RFQ ││ Loan ││Escrow││Notify││ Price Feed │
└──────┘└─────┘└──────┘└──────┘└──────┘└───────────┘
                          │                    │
                ┌─────────┴──────┐             │
                ▼                ▼             ▼
          ┌──────────┐    ┌──────────┐  ┌──────────┐
          │ Indexer   │    │  Bound   │  │Liquidation│
          │(chain     │    │  Signer  │  │ Engine    │
          │ watcher)  │    │ (HSM)    │  │           │
          └──────────┘    └──────────┘  └──────────┘
                │
                ▼
          ┌──────────┐
          │ Bitcoin   │
          │  Node     │
          └──────────┘
```

---

## Module Boundaries

```
be/src/
├── commons/
│   ├── base-module/      # BaseService<T>, BaseEntity, BaseController
│   ├── constants/        # ENV_REGISTER, EVENT, TABLE_NAME, RESPONSE_CODE
│   └── types/            # IAppConfig, IDatabaseConfig, IRedisConfig, IBitcoinConfig
├── configs/              # registerAs() config files per env group
├── database/entities/    # All Mongoose schemas (export from index.ts)
├── modules/
│   ├── auth/             # JWT auth, Trading Wallet challenge/verify
│   ├── user/             # User CRUD, lender whitelist
│   ├── rfq/              # RFQ lifecycle, offer management
│   ├── loan/             # State machine (9 states), lifecycle
│   ├── escrow/           # 2-of-3 multisig, PSBT construction, signing
│   ├── price-feed/       # 5-source BTC price, oracle differential check
│   ├── liquidation/      # LTV monitor, liquidation execution
│   └── notification/     # WebSocket event hub + borrower alerts
├── shared/               # Cross-cutting services (Redis, external APIs)
├── guards/               # JwtAuthGuard, ApiKeyGuard, RolesGuard
├── interceptors/         # ResponseInterceptor (BaseResponseDto)
├── decorators/           # @User, @Public, @Roles, @PaginateQuery
├── exceptions/           # AllExceptionFilter, HttpExceptionFilter
└── utils/                # Stateless utilities
```

---

## Escrow Design — 2-of-3 Multisig

### Script (P2WSH)

```
OP_2 <BorrowerPK> <LenderPK> <BoundPK> OP_3 OP_CHECKMULTISIG
```

No timelocks. All three spending paths valid from day 0:

| Path | Signers | Use Case |
|---|---|---|
| Path 1 | Borrower + Bound | Normal repayment |
| Path 2 | Lender + Bound | Liquidation, forfeiture |
| Path 3 | Borrower + Lender | Fallback if Bound offline |

### Pre-signed Liquidation PSBT

Created at origination:
- **Input:** multisig UTXO (BTC collateral)
- **Output:** 100% BTC → Lender's address
- **Signed by:** Lender (at origination)
- **Held by:** Bound (co-signs ONLY on LTV breach + 15-min confirm)

---

## Loan State Machine

```
[RFQ_OPEN]
    │ lender submits offer
    ▼
[OFFERS_RECEIVED]
    │ borrower accepts
    ▼
[OFFER_SELECTED]
    │ Bound builds origination PSBT
    ▼
[ORIGINATION_PENDING]
    │ all 3 sign, TX confirmed (N confs)
    ▼
[ACTIVE] ──────────────────────────────────┐
    │              │              │         │
    │ repay        │ LTV ≥ 95%   │ term    │
    │ confirmed    │ + 15min     │ expires │
    ▼              ▼              ▼         │
[REPAID ✓]    [LIQUIDATED ✓]  [GRACE]      │
                                  │         │
                    ┌─────────────┼─────┐   │
                    │             │     │   │
                    │ repay       │ LTV │   │
                    │ confirmed   │≥95% │   │
                    ▼             ▼     │   │
                [REPAID ✓] [LIQUIDATED ✓]  │
                                  │        │
                                  │ grace  │
                                  │ expires│
                                  ▼        │
                              [DEFAULTED]  │
                                  │        │
                                  │ lender │
                                  │ claims │
                                  ▼        │
                              [FORFEITED ✓]│
                                           │
    [CANCELLED] ◄──────────────────────────┘
```

### State Transition Rules

| From → To | Trigger | Actor |
|---|---|---|
| RFQ_OPEN → OFFERS_RECEIVED | Lender submits offer | Lender |
| RFQ_OPEN → CANCELLED | RFQ expires or borrower cancels | System/Borrower |
| OFFERS_RECEIVED → OFFER_SELECTED | Borrower accepts | Borrower |
| OFFER_SELECTED → ORIGINATION_PENDING | Bound builds PSBT | Bound |
| ORIGINATION_PENDING → ACTIVE | All sign + N confirmations | System |
| ORIGINATION_PENDING → CANCELLED | Signing timeout | System |
| ACTIVE → REPAID | Repayment PSBT confirmed | Borrower + (Bound or Lender) |
| ACTIVE → LIQUIDATED | LTV ≥ 95% + 15-min confirm | Bound (co-signs pre-signed PSBT) |
| ACTIVE → GRACE | Term expires | System |
| GRACE → REPAID | Repayment PSBT confirmed | Borrower + (Bound or Lender) |
| GRACE → LIQUIDATED | LTV ≥ 95% + 15-min confirm | Bound |
| GRACE → DEFAULTED | Grace period expires | System |
| DEFAULTED → FORFEITED | Lender + Bound co-sign | Lender + Bound |

---

## PSBT Flows

### Origination (3-party atomic)

```
Inputs:
  [0] Lender's bUSD UTXO(s)    → principal + fee
  [1] Borrower's BTC UTXO(s)   → collateral

Outputs:
  [0] bUSD → Borrower           (loan amount)
  [1] bUSD → Bound              (origination fee)
  [2] BTC  → 2-of-3 multisig    (collateral locked)

Metadata: OP_RETURN with loan terms (CBOR encoded)

Signing order:
  1. Bound builds PSBT
  2. Borrower reviews + signs
  3. Lender reviews + signs
  4. Bound verifies + co-signs
  5. Broadcast

+ Simultaneously: Bound builds liquidation PSBT → Lender pre-signs → Bound stores
```

### Repayment (2-party)

```
Inputs:
  [0] Borrower's bUSD UTXO(s)  → principal + fee + interest
  [1] Multisig BTC UTXO         → collateral

Outputs:
  [0] BTC  → Borrower           (collateral returned)
  [1] bUSD → Lender             (principal + fee + interest)

Metadata: OP_RETURN with repayment details

Signing: Borrower + Bound (or Borrower + Lender if Bound offline)
```

### Liquidation (pre-signed)

```
Input:
  [0] Multisig BTC UTXO         → collateral

Output:
  [0] BTC → Lender              (100% collateral)

Already signed by: Lender (at origination)
Bound adds signature only on confirmed LTV breach (95% + 15-min window)
```

### Forfeiture (post-default)

```
Input:
  [0] Multisig BTC UTXO         → collateral

Output:
  [0] BTC → Lender              (100% collateral)

Signing: Lender requests → signs → Bound verifies default → co-signs
```

---

## API Design

### Auth
```
POST /auth/challenge          # Request signing challenge
POST /auth/verify             # Submit signature → JWT
POST /auth/refresh            # Refresh token
```

### RFQ (Borrower)
```
POST   /rfqs                  # Create RFQ { collateral_btc, amount_usd, term_days }
GET    /rfqs/:id              # RFQ detail + offers
POST   /rfqs/:id/accept       # Accept offer { offerId }
DELETE /rfqs/:id              # Cancel RFQ
```

### RFQ (Lender — whitelisted only)
```
GET    /rfqs/feed             # Subscribe to RFQ stream (WS upgrade)
POST   /rfqs/:id/offers       # Submit offer { rate_apr }
DELETE /rfqs/:id/offers/:oid  # Withdraw offer
```

### Origination
```
GET    /loans/:id/psbt/origination      # Get unsigned origination PSBT
POST   /loans/:id/psbt/origination/sign # Submit signature (each party)
GET    /loans/:id/psbt/liquidation      # Get liquidation PSBT for lender pre-sign
POST   /loans/:id/psbt/liquidation/sign # Lender submits pre-signature
```

### Loan
```
GET    /loans                  # My loans (filter: role, status)
GET    /loans/:id              # Loan detail + state + timeline
GET    /loans/:id/psbt/repay   # Get unsigned repayment PSBT
POST   /loans/:id/psbt/repay/sign  # Borrower submits repayment sig
POST   /loans/:id/forfeit      # Lender requests forfeiture (post-default only)
GET    /loans/:id/psbt/forfeit  # Get forfeiture PSBT
POST   /loans/:id/psbt/forfeit/sign # Lender signs forfeiture
```

### Dashboard
```
GET    /dashboard/summary      # { activeLoanCount, totalBorrowed, totalLent, atRiskLoans }
GET    /dashboard/loans        # Paginated loan list
```

### Internal (Bound Ops)
```
GET    /internal/review-queue           # Loans pending manual review (≥ 0.20 BTC)
POST   /internal/review-queue/:id/approve # Approve forfeiture/liquidation
POST   /internal/review-queue/:id/reject  # Reject with reason
GET    /internal/price-feeds            # Current price feed status
```

---

## Liquidation Engine

```
┌────────────────────────────────────────────────┐
│              Liquidation Engine                  │
├────────────────────────────────────────────────┤
│                                                 │
│  1. Price Poller (every 60s)                    │
│     → Query 5 feeds (dev decision on sources)   │
│     → Mix of aggregators + exchange APIs        │
│     → Require ≥ 3/5 feeds responsive            │
│     → Cache in Redis                            │
│                                                 │
│  2. LTV Scanner (every price update)            │
│     → For each ACTIVE + GRACE loan:             │
│       ltv = debt / (collateral × btc_price)     │
│       debt = principal + fee + accrued_interest  │
│     → If ltv ≥ 95%: trigger liquidation check   │
│                                                 │
│  3. Oracle Differential Check                   │
│     → Compare all 5 feed prices                 │
│     → Max diff between any two feeds ≤ 0.25%?   │
│       YES → proceed to execution                │
│       NO  → wait 5 min, re-query all feeds      │
│             repeat until ≤ 0.25% or LTV < 95%   │
│     → If collateral ≥ 0.20 BTC: manual review   │
│       + Discord alert before execution           │
│                                                 │
│  4. Execution                                   │
│     → Oracle check passed + LTV still ≥ 95%     │
│     → Retrieve pre-signed liquidation PSBT      │
│     → Bound co-signs                            │
│     → Broadcast                                 │
│     → Notify borrower                           │
│                                                 │
└────────────────────────────────────────────────┘
```

---

## Realtime Events (WebSocket)

### Connection
```
wss://api.bound.fi/ws?token=<jwt>
```

### RFQ Events
```
rfq:offer_received       { rfqId, offer }
rfq:offer_withdrawn      { rfqId, offerId }
rfq:accepted             { rfqId, offerId, loanId }
rfq:expired              { rfqId }
```

### Loan Events
```
loan:origination_ready    { loanId, psbtHex }
loan:origination_signed   { loanId, party }
loan:activated            { loanId, escrowAddress, txid }
loan:repayment_pending    { loanId, txid }
loan:repaid               { loanId, txid }
loan:in_danger            { loanId, currentLtv, btcPrice }
loan:liquidated           { loanId, txid }
loan:grace_started        { loanId, graceExpiresAt }
loan:defaulted            { loanId }
loan:forfeiture_pending   { loanId, txid }
loan:forfeited            { loanId, txid }
```

### Lender Feed
```
rfq:new                   { rfqId, amount, term }
```

---

## MongoDB Schema

### users
```javascript
{
  _id: ObjectId,
  address: "bc1...",             // Trading Wallet address
  pubkey: Buffer,
  roles: ["borrower", "lender"],
  tradingWalletId: String,
  isWhitelistedLender: Boolean,  // Manual approval required to lend
  createdAt: Date
}
```

### rfqs
```javascript
{
  _id: ObjectId,
  borrower: ObjectId,
  collateralBtc: Decimal128,    // BTC amount borrower offers as collateral
  amountUsd: Decimal128,         // Loan amount requested (creates implied LTV)
  impliedLtv: Number,           // Calculated: amountUsd / (collateralBtc * btcPrice)
  termDays: Number,
  status: "open" | "offers_received" | "selected" | "cancelled" | "expired",
  offers: [{
    _id: ObjectId,
    lender: ObjectId,
    lenderPubkey: Buffer,
    rateApr: Number,             // Only field lender sets
    status: "pending" | "accepted" | "withdrawn",
    createdAt: Date
  }],
  selectedOffer: ObjectId,
  expiresAt: Date,
  createdAt: Date
}
```

### loans
```javascript
{
  _id: ObjectId,
  rfq: ObjectId,
  borrower: ObjectId,
  lender: ObjectId,
  escrow: {
    address: String,
    redeemScript: Buffer,
    borrowerPubkey: Buffer,
    lenderPubkey: Buffer,
    boundPubkey: Buffer,
    fundingTxid: String,
    fundingVout: Number
  },
  terms: {
    principalUsd: Decimal128,
    originationFee: Decimal128,
    totalDebt: Decimal128,
    collateralBtc: Decimal128,
    rateApr: Number,
    termDays: Number,
    graceDays: 7,
    originatedAt: Date,
    termExpiresAt: Date,
    graceExpiresAt: Date
  },
  state: "origination_pending" | "active" | "grace" |
         "repaid" | "liquidated" | "defaulted" | "forfeited" | "cancelled",
  liquidation: {
    preSignedPsbt: Buffer,
    inDangerSince: Date,
    lastLtv: Number,
    lastPriceCheck: Date
  },
  timeline: [{
    event: String,
    txid: String,
    timestamp: Date,
    metadata: Object
  }],
  metadata: {
    encoded: Buffer,
    format: String
  },
  requiresManualReview: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### price_logs
```javascript
{
  _id: ObjectId,
  loanId: ObjectId,
  type: "routine" | "initial_breach" | "confirmation_recheck",
  feeds: {
    coinmarketcap: { price: Number, timestamp: Date, ok: Boolean },
    coingecko:     { price: Number, timestamp: Date, ok: Boolean },
    binance:       { price: Number, timestamp: Date, ok: Boolean },
    hyperliquid:   { price: Number, timestamp: Date, ok: Boolean },
    feed5:         { price: Number, timestamp: Date, ok: Boolean }
  },
  medianPrice: Number,
  responsiveFeeds: Number,
  calculatedLtv: Number,
  decision: "healthy" | "in_danger" | "liquidate" | "deferred",
  timestamp: Date
}
```

### events
```javascript
{
  _id: ObjectId,
  loanId: ObjectId,
  type: String,
  actor: "borrower" | "lender" | "bound" | "system",
  data: Object,
  timestamp: Date
}
```

### Indexes
```
users:       { address: 1 } unique
rfqs:        { status: 1, createdAt: -1 }, { borrower: 1 }, { expiresAt: 1 }
loans:       { state: 1 }, { borrower: 1 }, { lender: 1 },
             { "escrow.address": 1 } unique,
             { "terms.termExpiresAt": 1 }, { "terms.graceExpiresAt": 1 },
             { requiresManualReview: 1, state: 1 }
price_logs:  { loanId: 1, timestamp: -1 }, { type: 1, timestamp: -1 }
events:      { loanId: 1, timestamp: -1 }
```

---

## Queue Jobs (BullMQ)

| Job | Schedule | Action |
|---|---|---|
| `rfq:expire` | Per RFQ, at expiresAt | Cancel stale RFQs |
| `origination:timeout` | Per loan, at signing deadline | Cancel if not all signed |
| `loan:term-expiry` | Per loan, at termExpiresAt | ACTIVE → GRACE |
| `loan:grace-expiry` | Per loan, at graceExpiresAt | GRACE → DEFAULTED |
| `price:poll` | Repeating, every 60s | Fetch 5 feeds, cache median |
| `ltv:scan` | On every price update | Check all active loans |
| `ltv:oracle-check` | Per loan, on LTV breach | Oracle differential check (retry every 5 min if >0.25%) |
| `loan:notify-borrower` | Per event | Grace warning, in-danger, liquidation |
| `review:discord-alert` | On ≥0.20 BTC trigger | Post to Discord for manual review |

---

## Security & Edge Cases

| Risk | Mitigation |
|---|---|
| Bound offline (active loan) | Path 3: Borrower + Lender can cooperate directly |
| Bound offline (forfeiture) | Lender stuck → Bound HA infra, redundant signing |
| Price feed failure | Min 3/5 feeds required, defer liquidation if fewer |
| Premature liquidation | Oracle differential check (≤0.25% between feeds), retry every 5 min |
| Chain reorg | Wait N confirmations before state transitions |
| Partial bUSD on repayment | Reject — no partial repay in v1 |
| Large collateral seizure | Manual review ≥ 0.20 BTC + Discord alert |
| Origination timeout | Cancel cleanly, no risk (unsigned PSBT) |
| Fake lender offers | Lender whitelisting + Trading Wallet balance check |
| Bound + Lender collusion | Residual risk — documented in trust model |

---

## Configuration Parameters

| Parameter | Default | Status |
|---|---|---|
| `origination_fee_pct` | TBD | Awaiting business decision |
| `grace_period_days` | 7 | Confirmed |
| `liquidation_ltv_pct` | 95% | Confirmed |
| `oracle_differential_threshold_pct` | 0.25% | Confirmed |
| `oracle_retry_wait_seconds` | 300 | Confirmed |
| `min_price_feeds_required` | TBD | Needs engineering input |
| `rfq_expiry_seconds` | TBD | Needs product input |
| `origination_signing_timeout_seconds` | TBD | Needs product input |
| `min_loan_amount_usd` | TBD | Needs product input |
| `max_loan_amount_usd` | TBD | Needs product input |
| `min_loan_term_days` | TBD | Needs product input |
| `max_loan_term_days` | TBD | Needs product input |
| `on_chain_confirmation_threshold` | TBD | Needs engineering input |
| `interest_precision_decimals` | TBD | Needs engineering input |

---

## Build Order

| Phase | Scope | Timeline |
|---|---|---|
| Phase 1 | Escrow Core — 2-of-3 multisig, PSBT construction, metadata encoder, tests | Week 1-2 |
| Phase 2 | API + State Machine — auth, RFQ, loan lifecycle, PSBT signing endpoints | Week 3-4 |
| Phase 3 | Liquidation + Indexer — price feeds, LTV monitor, chain watcher | Week 5-6 |
| Phase 4 | Realtime + Notifications — WebSocket events, borrower alerts, timer jobs | Week 7 |
| Phase 5 | Frontend — borrower flow, lender flow, dashboards | Week 8-9 |
| Phase 6 | Testnet + Security — signet deploy, e2e testing, security audit | Week 10 |
