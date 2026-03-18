# Bound Lending — Backend

NestJS backend for the BTC-collateralized lending platform.

## Quick Start

```bash
# Start infra
docker-compose up -d   # from repo root

# Install & run
cp .env.example .env
npm install
npm run start:dev      # http://localhost:3000
```

Swagger docs: http://localhost:3000/docs

## Stack

- **NestJS** — modular DI framework
- **MongoDB** (Mongoose) — document store
- **Redis + BullMQ** — queues, caching
- **bitcoinjs-lib** — PSBT construction, multisig
- **cbor-x** — OP_RETURN metadata encoding
- **WebSocket** — realtime events

## Modules

| Module | Description |
|--------|-------------|
| `auth` | JWT challenge/verify/refresh (Trading Wallet) |
| `user` | User CRUD, lender whitelist management |
| `rfq` | RFQ lifecycle — create, offer, accept, cancel |
| `loan` | 9-state machine, origination, repayment, signing |
| `escrow` | 2-of-3 P2WSH multisig, 4 PSBT builders, signing utils |
| `price-feed` | BTC price (5 sources), oracle differential check |
| `liquidation` | LTV scan, 95% threshold, manual review ≥0.20 BTC |
| `indexer` | Chain watcher, funding detection, term/grace expiry |
| `notification` | WebSocket gateway (subscribe to rfq/loan channels) |
| `queue` | Background jobs — price poll, chain poll, expiry checks |

## API Endpoints

### Auth
```
POST /auth/challenge       — Request signing challenge
POST /auth/verify          — Submit signature → JWT
POST /auth/refresh         — Refresh access token
```

### RFQ
```
POST   /rfqs               — Create RFQ { collateralBtc, amountUsd, termDays }
GET    /rfqs/:id           — Get RFQ + offers
POST   /rfqs/:id/offers    — Submit offer { lenderPubkey, rateApr }
DELETE /rfqs/:id/offers/:oid — Withdraw offer
POST   /rfqs/:id/accept    — Accept offer { offerId }
DELETE /rfqs/:id           — Cancel RFQ
```

### Loans
```
GET    /loans              — List my loans (?role=borrower|lender&status=active)
GET    /loans/:id          — Loan details
GET    /loans/:id/repayment-quote — Repayment calculation
POST   /loans/:id/psbt/origination/sign — Submit origination signature
POST   /loans/:id/psbt/repay/sign — Submit repayment signature
POST   /loans/:id/forfeit  — Request forfeiture (post-default)
```

### Dashboard
```
GET /dashboard/summary     — { activeLoanCount, totalBorrowed, totalLent, atRiskLoans }
GET /dashboard/loans       — Paginated loan list
```

### Public
```
GET /api/price/btc         — Current BTC price
GET /api/config/lending    — Lending config params
```

### Internal (Bound Ops)
```
GET  /internal/review-queue          — Loans pending manual review
POST /internal/review-queue/:id/approve
POST /internal/review-queue/:id/reject
GET  /internal/price-feeds           — Oracle status
```

### WebSocket
```
ws://localhost:3000/ws

Subscribe: { action: "subscribe", channels: ["rfq:<id>", "loan:<id>", "lender:feed"] }

Events:
  rfq:offer_received, rfq:accepted, rfq:expired
  loan:origination_signed, loan:activated, loan:in_danger
  loan:repaid, loan:liquidated, loan:grace_started, loan:defaulted, loan:forfeited
```

## Project Structure

```
src/
├── commons/
│   ├── base-module/       — BaseService<T>, BaseEntity, BaseController
│   ├── constants/         — ENV_REGISTER, TABLE_NAME, EVENT, RESPONSE_CODE
│   └── types/             — Config interfaces
├── configs/               — registerAs() config files
├── database/entities/     — Mongoose schemas (user, rfq, loan, price-log, event)
├── modules/               — Feature modules (one per domain)
├── guards/                — JwtAuthGuard
├── interceptors/          — ResponseInterceptor
├── decorators/            — @Public
├── exceptions/            — AllExceptionFilter
├── queue/                 — Background job processor
└── main.ts                — Bootstrap + Swagger
```

## Coding Rules

See `CLAUDE.md` in this directory for full coding conventions — module patterns, naming, anti-patterns, testing rules.

## Tests

```bash
npm test              # Run all tests
npm run test:cov      # With coverage
```

## Environment Variables

See `.env.example` for all config — app, database, redis, bitcoin, lending, price feeds.
