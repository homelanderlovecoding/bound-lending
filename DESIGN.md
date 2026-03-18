# Bound Lending — Full System Design (v2)

*Based on latest spec — 2-of-3 multisig, liquidation, pre-signed PSBTs*

---

## 1. Key Changes from v1

| Before (v1 design) | Now (updated spec) |
|---|---|
| Taproot timelocked paths (P2TR) | 2-of-3 multisig, no timelocks |
| No liquidation | Liquidation at 95% LTV |
| Lender solo exit (Leaf C) | Not in spec — Bound HA instead |
| Fixed grace scaling | Fixed 7-day grace (confirmed) |
| No pre-signed PSBTs | Pre-signed liquidation PSBT at origination |
| No price oracle | 5 price feeds, 15-min confirmation window |
| Auth: BIP-322 | TBD — Bound Trading Wallet based |

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js (TypeScript) | Best Bitcoin lib support |
| DB | MongoDB | Flexible loan/RFQ schema, easy to iterate |
| Cache/Queue | Redis + BullMQ | Timer jobs, price cache, PSBT expiry |
| Realtime | WebSocket (ws) | RFQ feed + loan events |
| Price Feeds | CoinMarketCap, CoinGecko, Binance, Hyperliquid, +1 TBD | 5-source median for liquidation |
| Bitcoin | bitcoinjs-lib + Bitcoin Core RPC + mempool.space | Multisig, PSBT, chain monitoring |
| Frontend | Next.js | Borrower UI + lender dashboard |
| Wallet | Bound Trading Wallet SDK | Required — no external wallets |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────┐
│              Frontend (Next.js)                       │
│  Borrower: /borrow  /rfq/:id  /loan/:id  /dashboard  │
│  Lender:   /lend    /offers   /loan/:id  /dashboard   │
└──────────┬────────────────────────┬───────────────────┘
           │ REST                   │ WebSocket
           ▼                        ▼
┌──────────────────────────────────────────────────────┐
│                 API Gateway (Express)                  │
│              Auth middleware (Trading Wallet)          │
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

## 4. Module Boundaries

```
src/
├── auth/             # Trading Wallet auth, session management
├── rfq/              # RFQ lifecycle, offer management
├── loan/             # State machine (9 states), lifecycle
├── escrow/           # 2-of-3 multisig builder, PSBT construction
├── signer/           # Bound co-signing (isolated, HSM-ready)
├── indexer/          # Chain watcher, mempool monitor, reorg detection
├── liquidation/      # Price feeds, LTV monitor, 15-min confirm window
├── notify/           # WebSocket hub + borrower alerts
├── queue/            # BullMQ jobs (timers, retries, price checks)
├── metadata/         # Loan metadata encoder/decoder (OP_RETURN)
├── api/
│   ├── borrower/     # Borrower-facing routes
│   ├── lender/       # Lender-facing routes (API integration)
│   └── internal/     # Bound ops routes (manual review, admin)
├── db/               # MongoDB models, indexes
└── shared/           # Types, constants, config params, errors
```

---

## 5. Escrow Design — 2-of-3 Multisig

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
- Input: multisig UTXO (BTC collateral)
- Output: 100% BTC → Lender's address
- Signed by: Lender (at origination)
- Held by: Bound (co-signs ONLY on LTV breach + 15-min confirm)

---

## 6. Loan State Machine

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

---

## 7. API Design

### Auth
```
POST /auth/challenge
POST /auth/verify
POST /auth/refresh
```

### RFQ (Borrower)
```
POST   /rfqs
GET    /rfqs/:id
POST   /rfqs/:id/accept
DELETE /rfqs/:id
```

### RFQ (Lender)
```
GET    /rfqs/feed              # WS upgrade
POST   /rfqs/:id/offers
DELETE /rfqs/:id/offers/:oid
```

### Origination
```
GET    /loans/:id/psbt/origination
POST   /loans/:id/psbt/origination/sign
GET    /loans/:id/psbt/liquidation
POST   /loans/:id/psbt/liquidation/sign
```

### Loan
```
GET    /loans
GET    /loans/:id
GET    /loans/:id/psbt/repay
POST   /loans/:id/psbt/repay/sign
POST   /loans/:id/forfeit
GET    /loans/:id/psbt/forfeit
POST   /loans/:id/psbt/forfeit/sign
```

### Dashboard
```
GET    /dashboard/summary
GET    /dashboard/loans
```

### Internal (Bound Ops)
```
GET    /internal/review-queue
POST   /internal/review-queue/:id/approve
POST   /internal/review-queue/:id/reject
GET    /internal/price-feeds
```

---

## 8. Liquidation Engine

1. Price Poller (every 60s) → 5 feeds → MEDIAN → require ≥3/5
2. LTV Scanner → check all ACTIVE + GRACE loans
3. 15-min Confirmation Window → recheck before execution
4. Manual review for ≥ 0.20 BTC collateral + Discord alert
5. Execute: co-sign pre-signed PSBT → broadcast

---

## 9. MongoDB Collections

- users, rfqs, loans, price_logs, events (see full schema in design discussion)

---

## 10. Build Order

Phase 1 — Escrow Core (Week 1-2)
Phase 2 — API + State Machine (Week 3-4)
Phase 3 — Liquidation + Indexer (Week 5-6)
Phase 4 — Realtime + Notifications (Week 7)
Phase 5 — Frontend (Week 8-9)
Phase 6 — Testnet + Security (Week 10)
