# CHANGELOG

All notable changes to Bound Lending, tracked per session.

---

## 2026-03-21

### Features
- **Borrower accept + sign flow** — accept offer → get lender-signed PSBT → borrower signs their inputs → Bound finalizes → broadcast → loan ACTIVE
- **Funding confirmation** — loan transitions to ACTIVE immediately after broadcast (MVP; indexer-based confirmation later)
- **Repay flow wired** — MyLoanCard "Repay" button: get repay PSBT → wallet sign → broadcast → REPAID
- **Active Loans tab** — "Sign & Activate" button for ORIGINATION_PENDING loans, "Repay" for ACTIVE/GRACE
- **Complete origination PSBT at offer time** — BE fetches lender bUSD Rune UTXOs + borrower BTC UTXOs from UniSat API, builds full PSBT
- **Runestone OP_RETURN** (runelib) — proper Rune edicts: bUSD loan→borrower (edict), bUSD change→lender (pointer)
- **Dynamic fee rate** — fetched from UniSat `/v1/indexer/fees/recommended` instead of hardcoded 2000 sats
- **UtxoLockService** — in-memory UTXO lock map, prevents double-spend across lender offers
- **OfferPsbtService** — builds unsigned P2TR commitment PSBT, lender signs at offer time
- **Lend validations** — no self-lending, bUSD balance check, 1 offer per lender (upsert), show/edit existing offer
- **Lend tab** — open RFQ feed visible without login, offer submit with APR, connect prompt on action
- **Borrow tab redesign** — RFQ dashboard, New Loan modal, offers drawer, collateral coverage (LIFO auto-cancel)
- **Global JWT guard** — all routes protected by default, `@Public()` for open endpoints
- **RuneService** — `buildBusdRunestone()` with edicts + change pointer (monkey-patched runelib BigInt sort bug)

### Fixes
- Proper error responses from PSBT prepare (throw `BadRequestException`, not return null)
- Fixed UniSat Rune UTXO API URL (`/address/.../runes/.../utxo`)
- Fixed 0-input PSBT (return null when no UTXOs)
- Removed duplicate `signPsbt` import in borrow page
- Fixed `req.user` crash on unauthenticated RFQ endpoints (proper 401)

### Config
- `ORIGINATION_FEE_PCT=0` (fee output deferred to post-MVP)
- `MIN_LOAN_AMOUNT_USD=10`, `MIN_LOAN_TERM_DAYS=1`

---

## 2026-03-20

### Features
- **Deployed MVP** — BE on pm2 (port 3000), FE on Vercel (`bound-lending.vercel.app`), cloudflared tunnel
- **Wallet connect** — UniSat + Xverse, full auth flow (challenge → sign → JWT)
- **RFQ flow** — create, list, accept, cancel
- **Loan creation** — accept offer creates loan in ORIGINATION_PENDING
- **Active Loans tab** — My Loans cards + platform-wide table
- **CORS** enabled for Vercel + localhost
- **Real BTC price feeds** — 5-source median (CoinGecko, Binance, Kraken, Coinbase, Bybit)

---

## 2026-03-19

### Features
- **Full NestJS BE scaffolded** — Auth, User, RFQ, Loan, Escrow, PriceFeed, Liquidation, Indexer, Notification, Queue
- **Next.js FE scaffolded** — BorrowInputForm, LtvGauge, OfferCard, StepIndicator, TopNav
- **P2TR tapscript 2-of-3 multisig** — 3 leaves (borrower+lender, borrower+bound, lender+bound), NUMS internal key
- **BoundSignerService** — Bound key management, schnorr signing
- **LoanSigningService** — orchestrates all 4 PSBT flows (origination, repayment, liquidation, forfeiture)
- **Block height loan expiry** — 144 blocks/day, UniSat chain tip
- **RadFi + UniSat modules** — internal services, no public routes
- **110 BE tests + 47 FE tests + 17 E2E Playwright**
