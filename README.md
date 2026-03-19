# Bound Lending

BTC-collateralized, fixed-term, fixed-rate lending platform on Bitcoin Signet. Borrowers lock BTC in a 2-of-3 taproot multisig escrow and receive bUSD (Runes). Repay before deadline → get BTC back. Don't → lender claims BTC.

**Three parties:** Borrower, Lender, Bound (coordinator/co-signer)

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | NestJS (Node.js/TypeScript) | Modular DI framework |
| DB | MongoDB | RFQ/loan lifecycle |
| Cache/Queue | Redis + BullMQ | Timer jobs, price cache |
| Realtime | WebSocket (@nestjs/websockets) | RFQ feed + loan events |
| Price Feeds | CoinMarketCap, CoinGecko, Binance, Hyperliquid, Kraken | 5-source median |
| Bitcoin | bitcoinjs-lib + UniSat API | Taproot multisig, PSBT, chain monitoring |
| Runes Indexer | UniSat signet API | On-chain bUSD balance verification |
| Trading Wallet | RadFi signet API | UTXO fetching, balance queries, TX broadcast |
| Frontend | Next.js 14 | Borrower UI + lender dashboard |
| Testing | Jest (BE) + Vitest + RTL (FE) | 110 BE + 47 FE tests |

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
                   │       │                   │
          ┌────────┘   ┌───┴────────┐          │
          ▼            ▼            ▼           ▼
   ┌────────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐
   │LoanSigning │ │  Bound  │ │Liquidation│ │ Indexer  │
   │  Service   │ │ Signer  │ │  Engine  │ │(chain    │
   └────────────┘ └─────────┘ └──────────┘ │ watcher) │
          │            │                    └──────────┘
          ▼            ▼                         │
   ┌────────────────────────┐                    ▼
   │   RadFi Signet API     │          ┌──────────────────┐
   │ (UTXO + TX broadcast)  │          │  UniSat Signet   │
   └────────────────────────┘          │ (block height +  │
                                       │  Runes balance)  │
                                       └──────────────────┘
```

---

## Module Boundaries

```
be/src/
├── commons/
│   ├── base-module/      # BaseService<T>, BaseEntity, BaseController
│   ├── constants/        # ENV_REGISTER, EVENT, TABLE_NAME, RESPONSE_CODE
│   └── types/            # IAppConfig, IDatabaseConfig, IRadFiConfig, IUnisatConfig...
├── configs/              # registerAs() per env group (radfi, unisat, bitcoin...)
├── database/entities/    # Mongoose schemas (export from index.ts)
├── modules/
│   ├── auth/             # JWT auth, Trading Wallet challenge/verify
│   ├── user/             # User CRUD, lender whitelist
│   ├── rfq/              # RFQ lifecycle, offer management
│   ├── loan/             # 9-state machine, LoanService, LoanSigningService
│   ├── escrow/           # P2TR tapscript multisig, PSBT builders, BoundSignerService
│   ├── price-feed/       # 5-source BTC price, oracle differential check
│   ├── liquidation/      # LTV monitor, liquidation execution
│   ├── indexer/          # Block height expiry, funding confirmation
│   ├── notification/     # WebSocket event hub
│   ├── radfi/            # Bound Trading Wallet (UTXO, balance, broadcast)
│   └── unisat/           # On-chain Runes indexer, block height
└── queue/                # BullMQ background jobs
```

---

## Escrow Design — P2TR Tapscript 2-of-3

### Why Taproot over P2WSH

| | P2WSH OP_CHECKMULTISIG | P2TR Tapscript |
|---|---|---|
| Unspent path visibility | All 3 pubkeys revealed on spend | Unspent leaves stay hidden |
| Signature size | ECDSA 72 bytes each | Schnorr 64 bytes each |
| Future upgrade | Not upgradeable | Can migrate to MuSig2 key path |
| Cost vs P2WSH | Baseline | ~3–11 vbytes more per spend |

### Script Structure

```
Internal key: NUMS point (provably unspendable — no key path)
  "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0"

Taptree (3 leaves):
  ├── Leaf A (depth 1): borrower + lender
  │     <borrowerXOnly> OP_CHECKSIG <lenderXOnly> OP_CHECKSIGADD OP_2 OP_NUMEQUAL
  └── Branch
        ├── Leaf B (depth 2): borrower + bound
        │     <borrowerXOnly> OP_CHECKSIG <boundXOnly> OP_CHECKSIGADD OP_2 OP_NUMEQUAL
        └── Leaf C (depth 2): lender + bound
              <lenderXOnly> OP_CHECKSIG <boundXOnly> OP_CHECKSIGADD OP_2 OP_NUMEQUAL
```

Leaf A is at depth 1 (cheaper control block) — it's the cooperative repayment path used most often.

### Spending Paths

| Leaf | Signers | Use Case |
|---|---|---|
| A (borrower+lender) | Borrower + Lender | Fallback if Bound offline |
| B (borrower+bound) | Borrower + Bound | Normal repayment |
| C (lender+bound) | Lender + Bound | Liquidation, forfeiture |

### Pre-signed Liquidation PSBT

At origination Bound builds + pre-signs the liquidation PSBT (Leaf C spend):
- **Input:** multisig UTXO (BTC collateral)
- **Output:** 100% BTC → Lender's address
- **Bound signs at origination** → stored on loan
- **Triggered on:** LTV ≥ 95% + oracle check + 15-min confirmation

---

## PSBT Flows

### Origination (3-party atomic)

```
Inputs:
  [0..n] Lender bUSD UTXOs      → principal + fee
  [n+1..] Borrower BTC UTXOs   → collateral

Outputs:
  [0] bUSD → Borrower           (loan amount via Runes)
  [1] bUSD → Bound              (origination fee)
  [2] BTC  → P2TR tapscript     (collateral locked in 2-of-3)
  [3] OP_RETURN BNDL metadata   (CBOR encoded loan terms)
  [4] OP_RETURN Runes protocol  (Runes transfer data)

Signing:
  1. Bound builds PSBT + pre-signs liquidation PSBT (stored)
  2. Borrower signs
  3. Lender signs
  4. Bound auto-co-signs → broadcast via RadFi
```

### Repayment (borrower+bound path — Leaf B)

```
Inputs:
  [0..n] Borrower bUSD UTXOs   → principal + interest
  [n+1]  Multisig BTC UTXO    → collateral

Outputs:
  [0] BTC  → Borrower           (collateral returned)
  [1] bUSD → Lender             (principal + interest)
  [2] OP_RETURN BNDL metadata
  [3] OP_RETURN Runes protocol

Signing:
  1. GET /loans/:id/psbt/repay  → Bound pre-signs its half
  2. Borrower signs + submits
  3. Finalize + broadcast
```

### Liquidation (pre-signed, Leaf C)

```
Input:  Multisig BTC UTXO
Output: 100% BTC → Lender

Flow:
  1. LTV ≥ 95% detected by LiquidationEngine
  2. Oracle differential check (≤ 0.25% between feeds)
  3. 15-min confirmation window
  4. Retrieve pre-signed PSBT from loan.liquidation.preSignedPsbt
  5. Finalize (Bound sig already present from origination)
  6. Broadcast via RadFi
```

### Forfeiture (post-default, Leaf C)

```
Input:  Multisig BTC UTXO
Output: 100% BTC → Lender

Condition: loan.state === DEFAULTED (grace period expired)
Signing: Bound builds fresh PSBT + signs → broadcast
```

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
[ORIGINATION_PENDING]  ←── all 3 sign, TX confirmed (N blocks)
    ▼
[ACTIVE]
    ├── repay confirmed    → [REPAID ✓]
    ├── LTV ≥ 95%          → [LIQUIDATED ✓]
    └── termExpiresBlock   → [GRACE]
                                ├── repay confirmed  → [REPAID ✓]
                                ├── LTV ≥ 95%        → [LIQUIDATED ✓]
                                └── graceExpiresBlock → [DEFAULTED]
                                                            └── [FORFEITED ✓]
```

### Block Height Expiry

Loan term and grace expiry are enforced by **Bitcoin block height**, not wall-clock time.

```
originationBlock  = block height when funding confirmed
termExpiresBlock  = originationBlock + (termDays × 144)
graceExpiresBlock = termExpiresBlock + (graceDays × 144)
```

144 blocks/day ≈ 10-min average. Miners can manipulate timestamps ±1h (~6 blocks) — not relevant for loan terms. Timestamp fields (`termExpiresAt`, `graceExpiresAt`) are stored for display only.

Block height fetched from UniSat signet API: `GET /v1/indexer/blockchain/info`

---

## External Integrations

### RadFi Signet API (`https://signet.ums.radfi.co`)
No API key required. Used for:
- `GET /api/wallets/balance?address=` → BTC satoshi balance
- `GET /api/wallets/runes/balance?address=&runeId=` → bUSD Rune balance
- `GET /api/utxos` → UTXOs for PSBT construction
- `POST /api/transactions/broadcast` → broadcast signed TX

### UniSat Signet API (`https://open-api-signet.unisat.io`)
Requires `Authorization: Bearer <UNISAT_API_KEY>`. Used for:
- `GET /v1/indexer/runes/address/{addr}/{runeId}/balance` → on-chain bUSD balance
- `GET /v1/indexer/address/{addr}/balance` → on-chain BTC balance
- `GET /v1/indexer/blockchain/info` → current block height

### API endpoint on BE

```
GET /api/unisat/balance?address=   → { blockHeight, btc, busd }
GET /api/radfi/balance?address=    → { btcSatoshi, btcAmount, busdAmount }
GET /api/unisat/blockchain/info    → { blockHeight, blockHash, network }
```

---

## API Design

### Auth
```
POST /auth/challenge          # Request signing challenge
POST /auth/verify             # Submit signature → JWT
POST /auth/refresh            # Refresh token
```

### RFQ
```
POST   /rfqs                  # Create RFQ { collateralBtc, amountUsd, termDays }
GET    /rfqs/:id              # RFQ detail + offers
POST   /rfqs/:id/offers       # Submit offer { lenderPubkey, rateApr }
DELETE /rfqs/:id/offers/:oid  # Withdraw offer
POST   /rfqs/:id/accept       # Accept offer { offerId }
DELETE /rfqs/:id              # Cancel RFQ
```

### Loans
```
GET    /loans                           # My loans
GET    /loans/:id                       # Loan detail
GET    /loans/:id/repayment-quote       # Principal + accrued interest
GET    /loans/:id/psbt/origination      # Get (or build) origination PSBT
POST   /loans/:id/psbt/origination/sign # Submit borrower/lender sig
GET    /loans/:id/psbt/repay            # Get repayment PSBT (Bound pre-signed)
POST   /loans/:id/psbt/repay/sign       # Borrower submits sig → finalize + broadcast
POST   /loans/:id/forfeit               # Execute forfeiture (DEFAULTED only)
```

### Dashboard
```
GET /dashboard/summary        # { activeLoanCount, totalBorrowed, atRiskLoans }
GET /dashboard/loans          # Paginated loan list
```

### Wallet & Chain
```
GET /api/unisat/balance?address=        # BTC + bUSD + block height
GET /api/unisat/balance/btc?address=    # BTC satoshi
GET /api/unisat/balance/rune?address=   # Rune balance
GET /api/unisat/blockchain/info         # Current block height
GET /api/radfi/balance?address=         # Trading Wallet balance
```

---

## Liquidation Engine

```
Price poll (60s)
    → 5 feeds → median → cache

LTV scan (per price update)
    → For each ACTIVE + GRACE loan:
      ltv = totalRepay / (collateralBtc × btcPrice) × 100
    → If ltv ≥ 95%: flag IN_DANGER + start oracle check

Oracle differential check
    → Max diff between any 2 feeds ≤ 0.25%?
      YES → proceed
      NO  → defer 5 min, retry
    → Collateral ≥ 0.20 BTC → emit REVIEW_REQUIRED (manual)
    → Re-check LTV after oracle check (price may have recovered)

Execution
    → Retrieve pre-signed PSBT (stored at origination)
    → Finalize (Bound sig already present)
    → Broadcast via RadFi
    → Transition loan → LIQUIDATED
```

---

## MongoDB Schema (key fields)

### loans
```javascript
{
  escrow: {
    address: String,          // P2TR taproot address
    redeemScript: String,     // legacy P2WSH (unused for taproot)
    borrowerPubkey: String,   // 33-byte compressed hex
    lenderPubkey: String,
    boundPubkey: String,
    fundingTxid: String,
    fundingVout: Number,
    taprootData: String,      // JSON: { leafBorrowerLender, leafBorrowerBound, leafLenderBound }
  },
  terms: {
    principalUsd: Number,
    originationFee: Number,
    totalDebt: Number,
    collateralBtc: Number,
    rateApr: Number,
    termDays: Number,
    graceDays: Number,
    // Block height enforcement
    originationBlock: Number,
    termExpiresBlock: Number,
    graceExpiresBlock: Number,
    // Timestamps for display only
    originatedAt: Date,
    termExpiresAt: Date,
    graceExpiresAt: Date,
  },
  liquidation: {
    preSignedPsbt: String,    // Bound's pre-signed liquidation PSBT (hex)
    inDangerSince: Date,
    lastLtv: Number,
    lastPriceCheck: Date,
  },
  originationPsbt: String,    // Unsigned origination PSBT (hex) during signing
  signatures: {
    borrower: Boolean,
    lender: Boolean,
    bound: Boolean,
  },
  requiresManualReview: Boolean,
  state: ELoanState,
  timeline: [{ event, timestamp, metadata }],
}
```

---

## Configuration

```env
# App
APP_PORT=3000
JWT_SECRET=<32+ char random>
API_SECRET_KEY=<32+ char random>
API_SECRET_WORD=bound-mvp

# Bitcoin
BITCOIN_NETWORK=signet
BOUND_PUBKEY=<33-byte compressed hex>
BOUND_PRIVATE_KEY=<WIF format>

# External APIs
RADFI_BASE_URL=https://signet.ums.radfi.co
UNISAT_BASE_URL=https://open-api-signet.unisat.io
UNISAT_API_KEY=<your unisat api key>
BUSD_RUNE_ID=<rune id e.g. 123:45>

# Lending
ORIGINATION_FEE_PCT=0.2
GRACE_PERIOD_DAYS=7
LIQUIDATION_LTV_PCT=95
MAX_LTV_PCT=80
MANUAL_REVIEW_BTC_THRESHOLD=0.20
ON_CHAIN_CONFIRMATION_THRESHOLD=3
```

---

## Build Status

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Escrow — P2TR tapscript 2-of-3, PSBT builders, BoundSigner | ✅ Done |
| Phase 2 | API — auth, RFQ, loan state machine, signing endpoints | ✅ Done |
| Phase 3 | Liquidation + Indexer — price feeds, LTV monitor, block height expiry | ✅ Done |
| Phase 4 | Realtime + Notifications — WebSocket, BullMQ jobs | ✅ Done |
| Phase 5 | Frontend — borrower flow, LTV gauge, active loans | ✅ Done |
| Phase 6 | External integrations — RadFi + UniSat signet | ✅ Done |
| Phase 7 | Deploy — Cloudflare tunnel, Vercel, pm2 | 🔄 In progress |

**Tests:** 110 BE (Jest) + 47 FE (Vitest + RTL) = 157 total, all passing.
