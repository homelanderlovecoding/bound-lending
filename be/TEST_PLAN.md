# Unit Test Plan — Bound Lending BE

## Rules (CLAUDE.md)
- Mock services, never models — no `getModelToken`, no `MongooseModule.forFeature` in test modules
- Use `Test.createTestingModule` with `providers` only
- Full `BaseService<T>` mock shape required (see below)
- ConfigService mock must handle constructor-time `.get()` calls
- EventEmitter2 mock must be provided for all service modules that emit events

### BaseService mock shape (complete)
```ts
const mockService = (overrides = {}) => ({
  findOne: jest.fn(),
  findOneOrThrow: jest.fn(),
  findById: jest.fn(),
  findByIdOrThrow: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  paginate: jest.fn(),
  ...overrides,
});
```

### ConfigService mock shape
```ts
const mockConfigService = {
  get: jest.fn().mockImplementation((key) => {
    if (key === ENV_REGISTER.LENDING) return {
      liquidationLtvPct: 95,
      manualReviewBtcThreshold: 0.20,
      onChainConfirmationThreshold: 6,
      gracePeriodDays: 7,
      originationFeePct: 0.2,
      maxLtvPct: 80,
      minLoanAmountUsd: 100,
      minLoanTermDays: 30,
    };
    if (key === ENV_REGISTER.PRICE_FEED) return {
      intervalMs: 60000,
      oracleDifferentialThresholdPct: 0.25,
    };
    if (key === ENV_REGISTER.APP) return {
      jwtExpiresIn: '15m',
      jwtRefreshExpiresIn: '7d',
    };
  }),
};
```

---

## 1. Escrow Module (12 existing + 21 new = 33 total)

### MultisigService ✅ (6 tests — done)
- ✅ Generate valid P2WSH address (regtest)
- ✅ Deterministic addresses (sorted pubkeys)
- ✅ Reject invalid pubkey (wrong length)
- ✅ Reject invalid pubkey (wrong prefix)
- ✅ Different addresses for mainnet vs regtest
- ✅ Same redeemScript across networks

### PsbtService (13 new tests)
> No DI mocks needed — pure bitcoinjs-lib. Call `bitcoin.initEccLib(ecc)` once at module level.
> Origination/repayment PSBTs have **2 OP_RETURN outputs** (Runes data + BNDL metadata).
> Liquidation/forfeiture have **0 OP_RETURN outputs**.

- Build origination PSBT: output count is 5 (borrower bUSD, Bound fee, multisig BTC, Runes OP_RETURN, BNDL OP_RETURN)
- Origination PSBT output[0]: bUSD → borrower address
- Origination PSBT output[1]: fee → Bound address
- Origination PSBT output[2]: BTC → multisig address (value = sum(borrowerBtcUtxos) - fee)
- Origination PSBT output[3] and [4]: both OP_RETURN (value = 0, script starts with OP_RETURN opcode)
- Build repayment PSBT: output count is 3 (BTC → borrower, bUSD → lender, Runes OP_RETURN) + optional BNDL OP_RETURN
- Repayment PSBT has BTC → borrower + bUSD → lender
- Build liquidation PSBT: 1 input, 1 output (BTC → lender, no OP_RETURN)
- Build forfeiture PSBT: same structure as liquidation
- Liquidation output value = multisigUtxo.value - ESTIMATED_FEE_SATS
- Reject zero-value UTXO input (value = 0)
- Multisig inputs include witnessScript in PSBT input data
- OP_RETURN outputs have value = 0 (confirmed by checking `psbt.txOutputs[i].value`)

### SigningService (8 new tests)
> No DI mocks needed — pure bitcoinjs-lib. Call `bitcoin.initEccLib(ecc)` once at module level.
> Use `buildLiquidationPsbt` for sign/finalize tests (1 input, 1 output — simplest to finalize).
> Do NOT use origination PSBT for finalization tests — bUSD inputs have empty scripts.

- Sign a PSBT input with valid keypair → `psbt.data.inputs[i].partialSig` has 1 entry
- Sign all inputs matching a keypair → all multisig inputs have partialSig entry
- Combine two partially-signed PSBTs → combined PSBT has 2 partial sigs on input
- Validate 2-of-3 signatures passes → `validateSignatures` returns true
- Validate 1-of-3 signatures fails → `validateSignatures` returns false
- Finalize PSBT with 2-of-3 sigs succeeds → `finalizePsbt` does not throw
- Finalize PSBT with 1-of-3 sigs throws → throws `BadRequestException`
- Finalize + extract produces valid TX with correct witness stack:
  - `Transaction.fromHex(hex)` does not throw
  - `tx.ins[0].witness.length === 4` (OP_0, sig1, sig2, redeemScript)
  - `tx.outs[0].value === multisigUtxo.value - ESTIMATED_FEE_SATS`

### MetadataService ✅ (6 tests — done)
- ✅ Encode/decode origination round-trip
- ✅ Encode/decode repayment round-trip
- ✅ Magic bytes are BNDL
- ✅ Version byte is 0x01
- ✅ Reject wrong magic bytes
- ✅ Reject buffer too short
> Note: No byte-size limit assertions — Bitcoin Core v28+ removed OP_RETURN size limits entirely.

---

## 2. Auth Module (7 tests)
> Providers: `AuthService`, `{ provide: ConfigService, useValue: mockConfigService }`, `{ provide: JwtService, useValue: mockJwtService }`
> `challenges` is a module-level Map — call `generateChallenge` in the same test to get the nonce; never hardcode a nonce.
> For expiry tests: use `jest.useFakeTimers()` + `jest.advanceTimersByTime(6 * 60 * 1000)` (advance past 5-min TTL).

```ts
const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn().mockReturnValue({ sub: 'addr', userId: 'uid', roles: ['borrower'] }),
};
```

- `generateChallenge` returns `{ message, nonce, expiresAt }`
- Challenge message contains the wallet address
- `verifyAndIssueTokens` returns `{ accessToken, refreshToken }`
- Verify rejects expired challenge (use fake timers, advance 6 min)
- Verify rejects unknown nonce → throws `BadRequestException`
- `refreshAccessToken` returns new tokens from valid refresh token
- `refreshAccessToken` throws on invalid/expired token (`jwtService.verify` throws)

---

## 3. User Module (6 tests)
> Providers: `UserService`, `{ provide: UserService, useValue: mockUserService() }`
> UserService has no external deps — mock the BaseService methods directly on the service instance via `jest.spyOn`.

- `findOrCreateByAddress` creates new user if not exists → `findOne` returns null, `create` is called
- `findOrCreateByAddress` returns existing user if exists → `findOne` returns user, `create` not called
- New user gets `EUserRole.BORROWER` role by default
- `isWhitelistedLender` returns false for non-whitelisted user
- `whitelistLender` calls `findByIdAndUpdate` with `$set: { isWhitelistedLender: true }` and `$addToSet: { roles: EUserRole.LENDER }`
- `isWhitelistedLender` returns true after whitelisting

---

## 4. RFQ Module (14 tests)
> Providers: `RfqService`, `mockUserService`, `mockConfigService`, `mockEventEmitter`
> Fold event emit assertions into the relevant test cases.

- `createRfq` creates RFQ with correct fields (status=OPEN, correct borrower, collateral, amount)
- `createRfq` calculates implied LTV correctly
- `createRfq` rejects if LTV > 80% → throws `BadRequestException`
- `createRfq` sets 24h expiry (`expiresAt ≈ Date.now() + 24h`)
- `createRfq` emits `EVENT.RFQ_CREATED` with `{ rfqId }`
- `submitOffer` adds offer to RFQ + sets status to `OFFERS_RECEIVED` + emits `EVENT.RFQ_OFFER_RECEIVED`
- `submitOffer` rejects non-whitelisted lender → `userService.isWhitelistedLender` returns false → throws `ForbiddenException`
- `submitOffer` rejects expired RFQ → throws `BadRequestException`
- `submitOffer` rejects already-accepted RFQ (status=SELECTED) → throws `BadRequestException`
- `withdrawOffer` sets offer status to `WITHDRAWN` + emits `EVENT.RFQ_OFFER_WITHDRAWN`
- `acceptOffer` sets RFQ status to `SELECTED` + emits `EVENT.RFQ_ACCEPTED`
- `acceptOffer` rejects if caller is not the borrower → throws `ForbiddenException`
- `cancelRfq` cancels open RFQ + emits `EVENT.RFQ_CANCELLED`
- `cancelRfq` rejects if already selected → throws `BadRequestException`

---

## 5. Loan Module (19 tests)
> Providers: `LoanService`, `mockMultisigService`, `mockPsbtService`, `mockSigningService`, `mockMetadataService`, `mockConfigService`, `mockEventEmitter`

### State Machine
- `createFromRfq` creates loan in `ORIGINATION_PENDING` state
- `createFromRfq` calls `multisigService.createMultisigAddress` and stores result in `escrow`
- `createFromRfq` calculates origination fee + total debt correctly
- `createFromRfq` sets `requiresManualReview = true` if collateral ≥ 0.20 BTC
- `createFromRfq` emits `EVENT.LOAN_ORIGINATION_READY`
- `transitionState` ORIGINATION_PENDING → ACTIVE succeeds + emits `EVENT.LOAN_ACTIVATED`
- `transitionState` ACTIVE → GRACE succeeds
- `transitionState` ACTIVE → REPAID succeeds
- `transitionState` ACTIVE → LIQUIDATED succeeds
- `transitionState` GRACE → DEFAULTED succeeds
- `transitionState` DEFAULTED → FORFEITED succeeds
- `transitionState` rejects invalid transition (ACTIVE → FORFEITED) → throws `BadRequestException`
- `transitionState` rejects transition from terminal state (REPAID → anything) → throws `BadRequestException`
- `transitionState` appends to `timeline` array (`$push` called with correct event + timestamp)

### Signing
- `recordSignature` marks borrower as signed (`findByIdAndUpdate` called with `$set: { 'signatures.borrower': true }`)
- `recordSignature` rejects if loan not in `ORIGINATION_PENDING` → throws `BadRequestException`
- `recordSignature` emits `EVENT.LOAN_ORIGINATION_SIGNED`

### Repayment Calc
- `calculateRepaymentAmount` returns correct accrued interest for N days (deterministic: mock `originatedAt` to fixed past date)

---

## 6. Liquidation Module (11 tests)
> Providers: `LiquidationService`, `mockLoanService`, `mockPriceFeedService`, `mockConfigService`, `mockEventEmitter`
> For LTV recovery test: use `mockPriceFeedService.getBtcPrice.mockResolvedValueOnce(low).mockResolvedValueOnce(high)` to simulate price recovery between oracle check and re-check inside `executeLiquidation`.

- `scanAllLoans` skips if BTC price unavailable (returns 0) → returns `[]`
- `scanAllLoans` returns empty array if no active loans
- `checkLoanLtv` returns `null` if LTV < 95%
- `checkLoanLtv` flags IN_DANGER if LTV ≥ 95% → `findByIdAndUpdate` called with `$set: { 'liquidation.inDangerSince': <date> }` + emits `EVENT.LOAN_IN_DANGER`
- `checkLoanLtv` clears IN_DANGER flag if LTV recovers → `findByIdAndUpdate` called with `$set: { 'liquidation.inDangerSince': null }`
- `executeOracleCheck` returns `true` if differential ≤ 0.25%
- `executeOracleCheck` returns `false` if differential > 0.25%
- `executeLiquidation` skips if oracle check fails → `loanService.transitionState` not called
- `executeLiquidation` skips if LTV recovered after oracle check → `transitionState` not called
- `executeLiquidation` routes to manual review if collateral ≥ 0.20 BTC → emits `EVENT.REVIEW_REQUIRED`, `transitionState` not called
- `executeLiquidation` happy path: oracle OK + LTV breached + collateral < 0.20 BTC → `loanService.transitionState` called with `ELoanState.LIQUIDATED`

---

## 7. Indexer Module (8 tests)
> Providers: `IndexerService`, `mockLoanService`, `mockConfigService`, `mockEventEmitter`
> "Funding confirmed" tests require: `jest.spyOn(service as any, 'fetchUtxoStatus').mockResolvedValue({ txid: 'abc...', vout: 0, value: 100000, confirmations: 6, isConfirmed: true })`

- `watchEscrowAddress` adds address to internal `watchedAddresses` Map
- `unwatchAddress` removes address from `watchedAddresses` Map
- `checkLoanExpiry` transitions ACTIVE → GRACE when `termExpiresAt` has passed
- `checkLoanExpiry` transitions GRACE → DEFAULTED when `graceExpiresAt` has passed
- `checkLoanExpiry` does not transition if neither date has passed
- `checkPendingFunding` skips loans without `escrow.address`
- Funding confirmed: `findByIdAndUpdate` called with `escrow.fundingTxid`, `escrow.fundingVout`
- Funding confirmed: `findByIdAndUpdate` called with `terms.originatedAt`, `terms.termExpiresAt`, `terms.graceExpiresAt`

---

## 8. Price Feed Module (7 tests)
> Providers: `PriceFeedService`, `mockConfigService`
> `fetchAllFeeds` is private — control it via `jest.spyOn(service as any, 'fetchAllFeeds').mockResolvedValue([...])`
> `calculateMedian` and `calculateMaxDifferential` are private — test via `checkOracleDifferential` with controlled feed data, not via `(service as any)`.

- `getBtcPrice` returns cached price if cache is fresh (< `intervalMs`) → `fetchAllFeeds` not called second time
- `getBtcPrice` fetches new price if cache is stale → `fetchAllFeeds` called, new median returned
- `checkOracleDifferential` returns `isOk=true` when 5 feeds agree (tests median odd-count path)
- `checkOracleDifferential` returns `isOk=true` when 4 feeds agree (tests median even-count path)
- `checkOracleDifferential` returns `isOk=false` when feeds diverge > 0.25%
- `checkOracleDifferential` detects correct max pairwise differential (feed A and feed E are far apart, others are close — assert `maxDifferentialPct` matches expected value)
- `getBtcPrice` returns 0 (cached fallback) if fewer than 3 feeds respond

---

## Summary

| Module            | Tests | Status          |
|-------------------|-------|-----------------|
| Escrow — Multisig | 6     | ✅ Done          |
| Escrow — PSBT     | 13    | New             |
| Escrow — Signing  | 8     | New             |
| Escrow — Metadata | 6     | ✅ Done          |
| Auth              | 7     | New             |
| User              | 6     | New             |
| RFQ               | 14    | New             |
| Loan              | 19    | New             |
| Liquidation       | 11    | New             |
| Indexer           | 8     | New             |
| Price Feed        | 7     | New             |
| **Total**         | **105** | 12 done, 93 new |

---

## Key Notes

### Bitcoin Core v28+ — OP_RETURN rules relaxed
- Multiple OP_RETURNs per transaction are standard (was 1 max before v28)
- No size limit per OP_RETURN output (was 80 bytes before v28)
- Origination PSBT has **2 OP_RETURNs**: Runes protocol data + BNDL loan metadata
- Repayment PSBT has **2 OP_RETURNs**: Runes protocol data + BNDL repayment metadata
- Liquidation + forfeiture PSBTs have **0 OP_RETURNs**
- Do NOT write tests asserting OP_RETURN payload ≤ 80 bytes — limit no longer exists

### bUSD inputs in PSBT tests
- bUSD UTXOs use empty witness scripts (Runes are tracked off-chain via indexer)
- Do NOT use origination PSBT for finalize/extract tests — bUSD inputs are unfinalizable in unit tests without a real indexer
- Use `buildLiquidationPsbt` for all sign + finalize + extract tests (1 BTC input, 1 BTC output)
