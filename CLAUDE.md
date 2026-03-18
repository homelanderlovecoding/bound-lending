# CLAUDE.md — Bound Lending

You are working on **Bound Lending** — a BTC-collateralized, fixed-term, fixed-rate lending platform.

## Quick Orient

1. **Read these first** (in order):
   - `SPEC.md` — Product specification (source of truth for all business logic)
   - `DESIGN.md` — System design (architecture decisions)
   - `README.md` — Full architecture, API endpoints, DB schemas, build plan

2. **Codebase structure:**
   ```
   bound-lending/
   ├── SPEC.md          # Product spec
   ├── DESIGN.md        # System design
   ├── README.md        # Architecture + API + schemas
   ├── CLAUDE.md        # You are here
   ├── docker-compose.yml  # MongoDB 7 + Redis 7
   ├── be/              # Backend (NestJS)
   │   ├── CLAUDE.md    # BE-specific coding rules (READ THIS before writing BE code)
   │   └── src/         # Source code
   └── fe/              # Frontend (Next.js) — TBD
   ```

3. **BE coding rules** are in `be/CLAUDE.md` — NestJS patterns, module structure, naming conventions, anti-patterns. Follow them strictly.

## What's Built (Phase 1 ✅)

- **Commons:** BaseService<T>, BaseEntity, BaseController, constants (ENV_REGISTER, TABLE_NAME, EVENT, RESPONSE_CODE), typed configs
- **Entities:** user, rfq, loan, price-log, event (all with full Mongoose schemas)
- **Escrow module** (fully implemented):
  - `MultisigService` — 2-of-3 P2WSH multisig address generation
  - `PsbtService` — 4 PSBT builders (origination, repayment, liquidation, forfeiture)
  - `SigningService` — sign, combine, validate 2-of-3 threshold, finalize
  - `MetadataService` — CBOR OP_RETURN encoder/decoder (BNDL magic + version)
- **Tests:** 12 passing (multisig + metadata)

## What's Next

### Phase 2 — API + State Machine ✅
- [x] Auth module (JWT, Trading Wallet challenge/verify)
- [x] User module (CRUD, lender whitelist)
- [x] RFQ module (create, offers, accept, cancel)
- [x] Loan module (9-state machine, lifecycle, repayment calc)
- [x] Price feed module (BTC price, oracle differential check)
- [x] Dashboard controller (summary, loan list)
- [x] API routes (auth, rfqs, loans, dashboard, price, config)

### Phase 3 — Liquidation + Indexer ✅
- [x] Liquidation module (LTV scan, oracle differential check, manual review, execution)
- [x] Indexer module (chain watcher, funding detection, term/grace expiry checks)

### Phase 4 — Realtime + Notifications ✅
- [x] WebSocket gateway (subscribe/unsubscribe channels, all RFQ + loan events)
- [x] Queue processor (price polling, chain polling, expiry checks)
- [x] Guards (JwtAuth), decorators (@Public), interceptors, exception filter

### Phase 5 — Frontend ✅
- [x] Next.js app in `fe/` with Tailwind, dark/light theme
- [x] Borrow flow (3-step: RFQ → Offers → Sign PSBT)
- [x] Active loans table (sortable)
- [x] Components: TopNav, LtvGauge, StepIndicator, OfferCard, ActiveLoansTable
- [x] API client (`fe/src/lib/api.ts`) with all endpoints
- [x] TypeScript types matching BE schemas

## Key Business Rules

- **Escrow:** 2-of-3 multisig (Borrower, Lender, Bound). No timelocks. Any 2 can spend.
- **Liquidation:** 95% LTV. Oracle differential check (≤0.25% between any two feeds). Manual review ≥0.20 BTC.
- **Grace period:** 7 days after term expiry.
- **Lenders:** Must be whitelisted by Bound.
- **Origination:** Single atomic PSBT (bUSD to borrower + fee to Bound + BTC to multisig).
- **Pre-signed liquidation PSBT:** Lender signs at origination. Bound co-signs only on confirmed LTV breach.

## API Endpoints (from README.md)

See README.md "API Design" section for full list. Key ones:
- Auth: POST /auth/challenge, /auth/verify, /auth/refresh
- RFQ: POST /rfqs, GET /rfqs/:id, POST /rfqs/:id/accept, POST /rfqs/:id/offers
- Loan: GET /loans, GET /loans/:id, PSBT sign endpoints, POST /loans/:id/forfeit
- Dashboard: GET /dashboard/summary, GET /dashboard/loans
- Internal: GET /internal/review-queue, approve/reject
- Price: GET /api/price/btc
- Config: GET /api/config/lending

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | NestJS (Node.js/TypeScript) |
| DB | MongoDB (Mongoose) |
| Queue | Redis + BullMQ |
| Realtime | WebSocket (@nestjs/websockets) |
| Bitcoin | bitcoinjs-lib, tiny-secp256k1, ecpair |
| Metadata | cbor-x (OP_RETURN encoding) |
| Frontend | Next.js (planned) |

## Running Locally

```bash
# Start infra
docker-compose up -d

# Backend
cd be
cp .env.example .env
npm install
npm run start:dev    # http://localhost:3000
                     # Swagger: http://localhost:3000/docs

# Tests
npm test
```

## Git

- **Repo:** github.com/homelanderlovecoding/bound-lending
- **Branch:** main
- **Commits:** conventional commits (feat:, fix:, docs:, refactor:)
