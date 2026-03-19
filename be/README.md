# Bound Lending — Backend

NestJS backend for the BTC-collateralized lending platform on Bitcoin Signet.

## Quick Start

```bash
# Start infra (MongoDB + Redis)
docker-compose up -d   # from repo root

# Install + run
cp .env.example .env
# Fill in BOUND_PUBKEY, BOUND_PRIVATE_KEY, UNISAT_API_KEY, BUSD_RUNE_ID
npm install
npm run start:dev      # http://localhost:3000/docs
```

## Stack

- **NestJS** — modular DI framework
- **MongoDB** (Mongoose) — document store
- **Redis + BullMQ** — queues, price cache
- **bitcoinjs-lib** — P2TR tapscript multisig, PSBT construction, Schnorr signing
- **cbor-x** — OP_RETURN metadata encoding
- **WebSocket** — realtime events
- **RadFi signet API** — UTXO fetch, TX broadcast
- **UniSat signet API** — on-chain Runes balance, block height

## Modules

| Module | Description |
|---|---|
| `auth` | JWT challenge/verify/refresh (Trading Wallet) |
| `user` | User CRUD, lender whitelist |
| `rfq` | RFQ lifecycle — create, offer, accept, cancel |
| `loan` | 9-state machine + LoanSigningService (full PSBT flows) |
| `escrow` | P2TR tapscript 2-of-3, PSBT builders, BoundSignerService |
| `price-feed` | BTC price (5 sources), oracle differential check |
| `liquidation` | LTV scan, 95% threshold, manual review ≥0.20 BTC |
| `indexer` | Block height expiry, funding confirmation via UniSat |
| `notification` | WebSocket gateway |
| `radfi` | Bound Trading Wallet API (UTXO, balance, broadcast) |
| `unisat` | On-chain Runes indexer + blockchain info |
| `queue` | BullMQ background jobs |

## Escrow — P2TR Tapscript 2-of-3

3 tapscript leaves, NUMS internal key (no key path spend):

```
Leaf A (depth 1): borrower + lender    → cooperative fallback
Leaf B (depth 2): borrower + bound     → normal repayment
Leaf C (depth 2): lender + bound       → liquidation + forfeiture
```

Each leaf uses `OP_CHECKSIGADD` pattern:
```
<pkA> OP_CHECKSIG <pkB> OP_CHECKSIGADD OP_2 OP_NUMEQUAL
```

Leaf A at depth 1 = cheapest control block (most common path).

## PSBT Signing Flows

### Origination
1. `GET /loans/:id/psbt/origination` — Bound builds P2TR PSBT + pre-signs liquidation PSBT
2. Borrower signs → `POST /loans/:id/psbt/origination/sign`
3. Lender signs → same endpoint
4. Bound auto-co-signs when both present → broadcast via RadFi

### Repayment (Leaf B: borrower+bound)
1. `GET /loans/:id/psbt/repay` — Bound pre-signs its half
2. Borrower signs → `POST /loans/:id/psbt/repay/sign` → finalize + broadcast

### Liquidation (Leaf C: lender+bound, pre-signed)
- Triggered automatically by LiquidationEngine on LTV ≥ 95%
- Bound's sig stored at origination — just finalize + broadcast
- Manual review required for collateral ≥ 0.20 BTC

### Forfeiture (Leaf C: lender+bound)
- Triggered by `POST /loans/:id/forfeit` after DEFAULTED state
- Bound builds fresh PSBT + signs + broadcasts

## Block Height Expiry

Term and grace expiry enforced by block height (not timestamps):
```
terminExpiresBlock  = originationBlock + (termDays × 144)
graceExpiresBlock   = termExpiresBlock + (graceDays × 144)
```
UniSat `GET /v1/indexer/blockchain/info` provides current chain tip.
Indexer checks `termExpiresBlock ≤ currentBlock` on every price cycle.

## API

```
POST /auth/challenge | /auth/verify | /auth/refresh

POST   /rfqs                          # Create RFQ
GET    /rfqs/:id                      # Detail + offers
POST   /rfqs/:id/offers               # Submit offer (whitelisted lenders)
DELETE /rfqs/:id/offers/:oid          # Withdraw offer
POST   /rfqs/:id/accept               # Accept offer
DELETE /rfqs/:id                      # Cancel

GET    /loans                         # My loans
GET    /loans/:id                     # Detail
GET    /loans/:id/repayment-quote     # Principal + interest
GET    /loans/:id/psbt/origination    # Get/build origination PSBT
POST   /loans/:id/psbt/origination/sign
GET    /loans/:id/psbt/repay          # Repayment PSBT (Bound pre-signed)
POST   /loans/:id/psbt/repay/sign
POST   /loans/:id/forfeit

GET /api/unisat/balance?address=      # BTC + bUSD + block height
GET /api/unisat/blockchain/info
GET /api/radfi/balance?address=

GET /dashboard/summary | /dashboard/loans
```

## Tests

```bash
npm test              # 110 tests, all passing
npm run test:cov      # Coverage report
```

See `TEST_PLAN.md` for full test spec.

## Environment

See `.env.example` — key vars:

```
BITCOIN_NETWORK=signet
BOUND_PUBKEY=           # 33-byte compressed hex
BOUND_PRIVATE_KEY=      # WIF format
UNISAT_API_KEY=         # UniSat developer key
BUSD_RUNE_ID=           # e.g. 123:45
RADFI_BASE_URL=https://signet.ums.radfi.co
UNISAT_BASE_URL=https://open-api-signet.unisat.io
```

## Coding Rules

See `CLAUDE.md` — module patterns, naming, anti-patterns, test rules.
