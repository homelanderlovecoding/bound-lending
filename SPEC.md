# **Bound Lending Specification**

## **1\. Overview**

**Purpose:** A BTC-collateralized, fixed-term, fixed-rate lending product built on Bound's existing Trading Address infrastructure. Borrowers lock BTC in a 2-of-3 multisig escrow and receive bUSD. They may repurchase their BTC by repaying principal \+ interest before term expiry. If BTC price drops and LTV breaches the liquidation threshold, collateral is liquidated. If the borrower does not repay by the end of the grace period, the lender claims the full BTC collateral.

**Bound's role in lending:** PSBT coordinator, multisig co-signer, origination fee collector, and price feed / liquidation monitor. Bound never has unilateral control over borrower collateral or lender funds. Bound does not custody either party's assets — it participates as one of three signers in a 2-of-3 multisig enforced by Bitcoin Script.

**Trust model summary:** BTC collateral is held in a 2-of-3 multisig between Borrower, Lender, and Bound. Any two of the three can move funds — no single party has unilateral control. Collateral theft requires active collusion between any two parties against the third.

---

## **2\. Definitions & Terminology**

### **Terms**

| Term | Definition |
| ----- | ----- |
| RFQ (Request for Quote) | A borrower-initiated request broadcast to lenders specifying desired loan amount and term length. |
| Loan Term | The agreed duration of the loan, starting from origination PSBT confirmation on-chain, in days. |
| Grace Period | A fixed window, in days, (see Configuration Parameters) after the stated loan term expires during which the borrower may still repay. After the grace period, Bound \+ Lender may claim collateral. |
| Liquidation Threshold | The LTV percentage at which Bound initiates liquidation of the borrower's collateral. Set at 95% LTV — the remaining 5% serves as an implied penalty. |
| Origination PSBT | The partially-signed Bitcoin transaction that atomically executes the loan: transfers bUSD from lender to borrower, locks BTC in the 2-of-3 multisig, and routes the origination fee to Bound. |
| Repayment PSBT | The partially-signed Bitcoin transaction that closes the loan: returns BTC to the borrower and transfers bUSD principal \+ interest to the lender. |
| Liquidation PSBT | A pre-signed PSBT created at origination that transfers 100% of BTC collateral to the lender. Lender signs at origination; Bound holds and co-signs only if the liquidation threshold is breached. |

### **Roles**

| Role | Description |
| ----- | ----- |
| Borrower | Deposits BTC collateral, receives stablecoin loan, may repay to reclaim BTC. Must operate from a Bound Trading Wallet. |
| Lender | Provides bUSD liquidity, sets LTV and interest rate per RFQ, receives repayment or claims collateral on default. Integrates via API. Must operate from a Bound Trading Wallet. |
| Bound | Coordinates PSBT construction, co-signs transactions, collects origination fees. Acts as a neutral third party — cannot move funds unilaterally. |

---

## **3\. Loan Lifecycle**

### **State Machine**

```
[RFQ Open] → [Offers Received] → [Offer Selected] → [Origination Pending]
    → [Active Loan] → [Repaid] (terminal)
    → [Active Loan] → [Liquidated] (terminal)
    → [Active Loan] → [Grace Period] → [Repaid] (terminal)
    → [Active Loan] → [Grace Period] → [Liquidated] (terminal)
    → [Active Loan] → [Grace Period] → [Defaulted] → [Forfeited] (terminal)
```

### **State Definitions**

**RFQ Open:** Borrower has submitted a loan request (amount \+ term). The RFQ is broadcast to connected lenders. The RFQ remains open until the borrower selects an offer or it expires.

**Offers Received:** One or more lenders have responded with quotes (collateral requirement, interest rate). Borrower is reviewing.

**Offer Selected:** Borrower has chosen a lender's offer. System transitions to origination.

**Origination Pending:** Bound constructs the origination PSBT. All three parties (Borrower, Lender, Bound) must sign. The loan is not active until the PSBT is confirmed on-chain.

**Active Loan:** The origination PSBT is confirmed. BTC is locked in the 2-of-3 multisig. The borrower holds stablecoins. The borrower may repay at any time during this state. Bound is actively monitoring BTC price for liquidation.

**Grace Period:** The stated loan term has expired but the grace period window is still open. The borrower can still repay during this window. Liquidation can still occur if LTV is breached.

**Repaid (terminal):** The borrower has repaid principal \+ accrued interest. BTC has been returned to the borrower. Loan is closed.

**Liquidated (terminal):** BTC price dropped and LTV breached the liquidation threshold. Bound co-signed the pre-signed liquidation PSBT, transferring collateral to the lender. Loan is closed.

**Defaulted:** The grace period has expired without repayment, Lender \+ Bound now have the power to spend the collateral.

**Forfeited (terminal):** Lender \+ Bound have co-signed to claim BTC collateral. Loan is closed and BTC is sent to lender

### **State Transition Rules**

| From | To | Trigger | Actor |
| ----- | ----- | ----- | ----- |
| RFQ Open | Offers Received | Lender submits a quote | Lender |
| RFQ Open | Cancelled | RFQ expires or borrower cancels | System / Borrower |
| Offers Received | Offer Selected | Borrower accepts a quote | Borrower |
| Offer Selected | Origination Pending | Bound constructs origination PSBT | Bound |
| Origination Pending | Active Loan | All three parties sign; PSBT confirmed on-chain | System (blockchain confirmation) |
| Origination Pending | Cancelled | Any party fails to sign within timeout | System |
| Active Loan | Repaid | Repayment PSBT confirmed on-chain | Borrower \+ (Bound or Lender) |
| Active Loan | Liquidated | LTV breaches liquidation threshold | Bound (co-signs pre-signed liquidation PSBT) |
| Active Loan | Grace Period | Loan term expires | System (time-based) |
| Grace Period | Repaid | Repayment PSBT confirmed on-chain | Borrower \+ (Bound or Lender) |
| Grace Period | Liquidated | LTV breaches liquidation threshold | Bound (co-signs pre-signed liquidation PSBT) |
| Grace Period | Defaulted | Grace period expires without repayment | System |
| Defaulted | Forfeited | Collateral is transferred to lender | Lender \+ Bound |

---

## **4\. RFQ System**

### **Borrower Flow**

1. Borrower specifies: loan amount (denominated in USD) and loan term (in days).  
2. System validates the borrower has sufficient BTC balance in their Trading Wallet to potentially collateralize the request (at \~50% LTV).  
3. RFQ is broadcast to all connected lenders.  
4. Borrower receives offers as they arrive and may select one at any time.  
5. If no offers arrive before the RFQ expiry window, the RFQ closes.

### **Lender Flow**

1. Lender subscribes to the RFQ feed via API.  
2. When an RFQ arrives, lender evaluates and may respond with:  
   * **Collateral required** (expressed as BTC amount or LTV ratio)  
   * **Interest rate** (annual percentage rate)  
3. The offer is delivered to the borrower in real-time.  
4. If the borrower selects this lender's offer, the system notifies the lender and transitions to origination.

### **Requirements**

* The RFQ system must support multiple simultaneous lenders responding to the same RFQ.  
* Offers must be delivered to the borrower in real-time (low-latency).  
* A lender's offer is binding once submitted — the lender must be prepared to fund the loan if selected. (We could require lenders to propose a PSBT in their response perhaps)  
* The system must handle RFQ expiry and clean up stale RFQs.

**🔧 Dev-Decision Zone:** The RFQ delivery mechanism (websocket, SSE, polling, push notification) is at the engineering team's discretion. A websocket-based pub/sub model is one viable approach for real-time delivery. The RFQ expiry duration is a configurable parameter (see Configuration Parameters).

---

## **5\. Loan Origination (PSBT Construction)**

### **Overview**

Loan origination is a single atomic Bitcoin transaction (PSBT) that simultaneously:

1. Transfers bUSD from the lender to the borrower (loan disbursement minus origination fee)  
2. Transfers bUSD from the lender to Bound (origination fee)  
3. Locks the borrower's BTC in a 2-of-3 multisig between Borrower, Lender, and Bound

All three transfers occur in one transaction — if any component fails, the entire origination fails. No party is exposed to partial execution.

Additionally, a pre-signed liquidation PSBT is created during origination (see below).

### **2-of-3 Multisig Spending Conditions**

The BTC collateral is locked in a 2-of-3 multisig. Any two of the three signers (Borrower, Lender, Bound) can move the collateral. There are no timelocks — the spending conditions are identical from origination through the life of the loan.

**Path 1 — Borrower \+ Bound:** Normal repayment path. Borrower initiates repayment, Bound verifies bUSD receipt and co-signs.

**Path 2 — Bound \+ Lender:** Liquidation, default forfeiture, or operational actions. Used when Bound and Lender agree to move collateral without borrower participation (e.g., LTV breach, grace period expiry).

**Path 3 — Borrower \+ Lender:** Fallback path. If Bound is unavailable, borrower and lender can cooperate directly to release collateral.

### **Origination Flow**

1. **Borrower selects an offer** — system captures: loan amount, BTC collateral amount, interest rate, term length, lender identity.  
2. **Bound constructs the origination PSBT** — includes all inputs (lender's bUSD UTXO, borrower's BTC UTXO) and outputs (bUSD to borrower, bUSD fee to Bound, BTC to 2-of-3 multisig address).  
3. **Bound constructs the liquidation PSBT** — a separate PSBT that transfers 100% of the collateral from the multisig to the lender's address. This PSBT is created now but only broadcast if liquidation is triggered.  
4. **Lender pre-signs the liquidation PSBT** — the lender signs the liquidation PSBT at origination. Bound holds this partially-signed PSBT and will only add its own signature if the liquidation threshold is breached.  
5. **Borrower reviews and signs the origination PSBT** — borrower verifies the PSBT details match the agreed terms before signing.  
6. **Lender signs the origination PSBT** — lender verifies and co-signs.  
7. **Bound signs the origination PSBT** — Bound verifies all parties have signed correctly, then adds its signature.  
8. **Origination PSBT is broadcast** — once all signatures are collected, the fully-signed transaction is broadcast to the Bitcoin network.  
9. **Confirmation** — the loan becomes Active once the transaction is confirmed on-chain. Bound begins LTV monitoring.

### **Requirements**

* The origination PSBT must be atomic — all transfers happen in one transaction.  
* All loan activity must occur in Bound Trading Wallets. Borrowers cannot use Connected Wallets for lending.  
* The system must record the multisig address and all party public keys for monitoring and future PSBT construction (repayment, liquidation, or forfeiture).  
* The pre-signed liquidation PSBT must be securely stored by Bound. It must only be co-signed and broadcast when the liquidation threshold is confirmed breached per the liquidation flow (see Section 7a).  
* Future tokenization plans \- The origination PSBT must include structured loan metadata embedded in the transaction. At minimum: loan amount, collateral amount, interest rate, origination date, expected repayment date, lender identifier, and borrower identifier. This metadata will be used in a future phase to tokenize loan positions on a separate chain, so the on-chain record must be self-describing. The encoding format and location within the transaction (e.g., additional OP\_RETURN, witness data) is a dev decision, but the data must be recoverable by parsing the confirmed transaction.

**🔧 Dev-Decision Zone:** The specific Bitcoin Script construction for the 2-of-3 multisig (bare multisig, P2WSH, P2TR with MuSig2 or script path) should be finalized during implementation. The functional requirement is that any 2 of the 3 keys can spend. The dev team should also determine the appropriate number of on-chain confirmations required before transitioning to Active state.

---

## **6\. Repayment Flow**

### **Overview**

Repayment closes the loan by atomically returning BTC collateral to the borrower and transferring bUSD (principal \+ accrued interest) to the lender.

### **Repayment Flow**

1. **Borrower initiates repayment** — via Bound UI or API call (e.g., `repay(loanId, amount)`). The system calculates the total repayment amount: principal \+ pro-rata accrued interest as of the current date.  
2. **Bound constructs the repayment PSBT** — includes: borrower's bUSD UTXO(s) as input, the multisig BTC as input, BTC output to borrower's Trading Address, bUSD output to lender.  
3. **Borrower reviews and signs** — borrower verifies the repayment amounts and signs.  
4. **Bound or Lender co-signs** — Bound verifies that the borrower's bUSD input contains sufficient balance (this is an off-chain verification via Runes indexer, not enforceable at the Bitcoin consensus layer), then co-signs the multisig spend. If Bound is unavailable, the borrower may request co-signing directly from the lender.  
5. **PSBT is broadcast and confirmed** — loan transitions to Repaid.

### **Early Repayment**

Borrowers may repay at any time during the Active or Grace Period states. There is no minimum hold period and no early repayment penalty. Interest accrues daily on a pro-rata basis — the borrower pays only for the days the loan was outstanding.

### **Requirements**

* Repayment must be available at any time during Active or Grace Period states.  
* The system must verify the borrower holds sufficient bUSD before constructing the PSBT.  
* If Bound is unavailable, the borrower must be able to contact the lender directly for co-signing. The system should provide a mechanism for this fallback path.  
* The repayment PSBT must include structured loan metadata embedded in the transaction, mirroring the origination metadata format. At minimum: loan ID, actual repayment date, principal repaid, interest paid, and days outstanding. This creates a complete on-chain audit trail for future loan tokenization on a separate chain.

**🔧 Dev-Decision Zone:** The fallback path for lender direct co-signing (API endpoint on lender side, communication protocol) should be defined in the lender integration specification.

---

## **7\. Default & Forfeiture**

### **Overview**

If the borrower does not repay by the end of the grace period, the loan enters the Defaulted state. The lender, with Bound's co-signature, can claim the full BTC collateral.

### **Forfeiture Flow**

1. **Grace period expires** — the system detects that the loan term \+ grace period has elapsed without a confirmed repayment PSBT.  
2. **Loan transitions to Defaulted** — Bound \+ Lender may now claim collateral via the 2-of-3 multisig (Path 2).  
3. **Lender requests forfeiture** — lender initiates a forfeiture request via API.  
4. **Bound constructs forfeiture PSBT** — transfers the full BTC collateral from the multisig to the lender's designated address.  
5. **Lender signs** — lender verifies and signs.  
6. **Bound co-signs** — Bound verifies the loan is genuinely in default (grace period expired, no repayment confirmed), then co-signs.  
7. **PSBT is broadcast and confirmed** — loan is fully closed.

### **Requirements**

* Forfeiture must only be possible after the grace period has fully expired. The system must not allow early forfeiture under any circumstances.  
* The full BTC collateral is transferred to the lender. There is no surplus return mechanism in v1.  
* Bound must independently verify that the loan is in default before co-signing the forfeiture PSBT. This verification should check: (a) the loan term \+ grace period has elapsed, and (b) no repayment PSBT has been confirmed on-chain. In version 1, let's have a manual review requirement for collateral seizure of \>= .20 BTC and build an internal notification system in Discord  
* The system must notify the borrower when their loan enters Grace Period and when it transitions to Defaulted.

**🔧 Dev-Decision Zone:** Notification mechanism for borrower alerts (email, push, in-app, webhook) should be determined during implementation. The system should also define how frequently it polls for loan state transitions (e.g., block-by-block monitoring vs. periodic checks).

---

## **8\. Liquidation**

### **Overview**

If BTC price drops and the loan's LTV breaches 95%, Bound initiates liquidation by co-signing the pre-signed liquidation PSBT. The full BTC collateral is transferred to the lender. No surplus is returned to the borrower — the 5% gap between the loan value and the collateral value at the point of liquidation serves as an implied penalty.

### **Price Feed**

Bound monitors BTC price using the average of 5 independent API sources: CoinMarketCap, CoinGecko, Binance, Hyperliquid, and one additional source.

**🔧 Dev-Decision Zone:** The fifth price feed source should be selected during implementation. The averaging method (mean, median, trimmed mean) and handling of stale or failed feeds should also be defined. Median may be more resilient to a single outlier feed.

### **LTV Calculation**

```
ltv = outstanding_debt / (btc_collateral × btc_price)
```

Where `outstanding_debt` is the loan principal \+ fee \+ accrued interest as of the current date.

### **Liquidation Flow**

1. **LTV breach detected** — Bound's price monitoring system detects that the loan's LTV has reached or exceeded 95%.  
2. **Loan marked as in-danger** — the system flags the loan and begins a 15-minute confirmation window.  
3. **Price re-check** — after 15 minutes, Bound refreshes all 5 price feeds and recalculates LTV.  
4. **If still above 95%** — Bound co-signs the pre-signed liquidation PSBT (already signed by the lender at origination) and broadcasts it.  
5. **Confirmation** — once confirmed on-chain, the loan transitions to Liquidated. The borrower is notified. The loan no longer needs to be repaid.

### **Requirements**

* Liquidation can occur at any time during Active or Grace Period states.  
* The 15-minute confirmation window is mandatory — Bound must not liquidate on a single price check.  
* The pre-signed liquidation PSBT (signed by lender at origination) must be the mechanism used. Bound adds its signature only after the confirmation window validates the breach.  
* All 5 price feeds must be queried on both the initial check and the re-check.  
* The system must log the price data from both checks for audit purposes.  
* The system must notify the borrower when their loan is marked as in-danger and again when liquidation is executed.  
* Manual review requirement for collateral seizure of \>= .20 BTC applies to liquidation as well (same as forfeiture, see Section 7).

---

## **9\. Origination Fee Structure**

The origination fee is Bound's revenue on each loan. It is added to the loan principal at origination and routed to Bound in the origination PSBT.

### **Mechanics**

* Borrower requests a loan of amount $X.  
* Bound APIs instruct Lender to send $X \+ fee in bUSD.  
* Borrower receives $X, but his principle debt is $X \+ fee  
* Bound receives the origination fee.  
* All three transfers happen atomically in the origination PSBT.

### **Requirements**

* The fee percentage must be a configurable system parameter (see Configuration Parameters).

---

## **10\. Interest Calculation**

### **Rate Determination**

The interest rate is set by the lender in their RFQ response, expressed as an annual percentage rate (APR). The rate is fixed for the life of the loan — it does not change regardless of market conditions.

### **Accrual Method**

Interest accrues daily on a pro-rata basis using the following calculation:

```
daily_rate = annual_rate / 365
accrued_interest = principal × daily_rate × days_outstanding
```

Where `days_outstanding` is the number of days from origination PSBT on-chain confirmation to repayment PSBT on-chain confirmation.

### **Requirements**

* Interest must be calculated on the original loan principal \+ fee (the lender's interest is based on the full amount they lent).  
* On repayment, the total amount owed is: principal \+ accrued interest as of the repayment date.

**🔧 Dev-Decision Zone:** The precision of daily interest calculation (rounding rules, decimal places) should be defined during implementation. A standard approach is to use fixed-point arithmetic with at least 8 decimal places and round to the nearest sat-equivalent on settlement.

---

## **11\. Trust Model & Security**

| Scenario | Spending Path | Result |
| ----- | ----- | ----- |
| Borrower wants to repay, Bound cooperates | Borrower \+ Bound | Normal repayment ✓ |
| Borrower wants to repay, Bound offline | Borrower \+ Lender | Fallback repayment ✓ |
| Bound tries to steal collateral alone | Requires second signer | Impossible ✓ |
| Lender tries to steal collateral alone | Requires second signer | Impossible ✓ |
| Borrower tries to steal collateral alone | Requires second signer | Impossible ✓ |
| Bound \+ Lender collude against borrower | Bound \+ Lender | Collateral stolen. Residual risk. |
| Bound \+ Borrower collude against lender | Bound \+ Borrower | Collateral returned without repayment. Lender loses. |
| Lender \+ Borrower collude against Bound | Lender \+ Borrower | Collateral moved without Bound involvement. Bound loses fee revenue only. |

---

## **12\. Edge Cases & Failure Modes**

### **Bound Offline During Active Loan**

**Impact:** Low. The borrower can route repayment through the lender directly (Borrower \+ Lender, Path 3). The loan does not require Bound's active participation to remain in a valid state.

**Required mitigation:** The system must provide borrowers with a mechanism to contact and co-sign with the lender directly if Bound is unreachable.

### **Bound Offline Post-Grace Period (Forfeiture)**

**Impact:** The lender cannot execute the forfeiture path because it requires Lender \+ Bound. The borrower's collateral effectively remains locked until Bound comes back online.

**Required mitigation:** This is borrower-protective but lender-risky. The lender integration documentation must clearly communicate this dependency. Bound should implement high-availability infrastructure for co-signing services.

**🔧 Dev-Decision Zone:** The HA architecture for Bound's co-signing service (redundancy, failover, key management for hot signing keys) should be determined during implementation. Consider whether a time-delayed automated co-signing process for forfeiture (after independent verification of default) could reduce lender exposure to Bound downtime.

### **Price Feed Failure**

**Impact:** If one or more price feed APIs are unavailable or returning stale data during a liquidation check, Bound may make incorrect liquidation decisions — either failing to liquidate (lender risk) or liquidating prematurely (borrower risk).

**Required mitigation:** The system must require a minimum number of responsive feeds (e.g., at least 3 of 5\) to proceed with a liquidation. If fewer than the minimum are available, the system should alert the operations team and defer the liquidation decision until sufficient feeds are restored. The 15-minute confirmation window provides an additional buffer against transient feed issues.

### **Origination Timeout**

**Impact:** If any party fails to sign the origination PSBT within the signing window, the loan origination fails. No funds are at risk (the PSBT is not valid until all signatures are collected).

**Required mitigation:** The system must define a signing timeout (see Configuration Parameters) and cleanly cancel the loan if it elapses, returning both parties to their pre-origination state.

### **Blockchain Reorganization**

**Impact:** If a confirmed origination or repayment PSBT is reversed by a chain reorganization, the loan state in Bound's database will be inconsistent with on-chain reality.

**Required mitigation:** The system must wait for a sufficient number of confirmations before transitioning loan state. The confirmation threshold should be configurable (see Configuration Parameters).

### **Partial bUSD Balance on Repayment**

**Impact:** If the borrower's bUSD balance is insufficient to cover principal \+ interest at repayment time, Bound should reject the repayment PSBT construction rather than allowing a partial repayment that leaves the loan in an ambiguous state.

**Required mitigation:** Bound must verify full repayment amount is available before constructing the PSBT. Partial repayment is not supported in v1.

---

## **13\. Lender Integration**

### **Overview**

Lenders integrate with Bound's lending system via an API. Any entity can register as a lender and begin responding to RFQs.

### **Required Lender Capabilities**

A lender must be able to:

1. **Subscribe to RFQ feed** — receive new loan requests in real-time.  
2. **Submit offers** — respond to RFQs with collateral requirements and interest rates.  
3. **Sign PSBTs** — co-sign origination, repayment, and forfeiture PSBTs when required.  
4. **Hold bUSD** — maintain sufficient bUSD balance to fund loans.  
5. **Receive repayments** — accept bUSD principal \+ interest on loan completion.  
6. **Receive BTC collateral** — accept BTC on borrower default.

### **API Requirements**

* The API must support lender authentication and authorization.  
* The API must provide real-time RFQ delivery with low latency.  
* The API must expose loan lifecycle events (origination confirmed, repayment initiated, grace period entered, default, liquidation in-danger, liquidation executed) so lenders can track their positions.  
* The API must support PSBT exchange: Bound sends unsigned/partially-signed PSBTs to lenders, lenders return their signed versions.

**🔧 Dev-Decision Zone:** The API design (REST, gRPC, websocket), authentication mechanism (API keys, OAuth, signed messages), and PSBT exchange protocol should be determined during implementation. A RESTful API with websocket for real-time events and API key authentication is one viable approach. The full lender API specification should be a separate document produced during implementation.

---

## **14\. Configuration Parameters**

| Parameter | Description | Default / Suggested | Status |
| ----- | ----- | ----- | ----- |
| `origination_fee_pct` | Percentage of loan principal collected by Bound as origination fee | TBD | Awaiting business decision |
| `grace_period_days` | Number of days after loan term expiry before forfeiture path activates | 7 | Confirmed |
| `liquidation_ltv_pct` | LTV percentage at which liquidation is triggered | 95% | Confirmed |
| `liquidation_confirmation_minutes` | Wait time between initial LTV breach detection and re-check before executing liquidation | 15 | Confirmed |
| `min_price_feeds_required` | Minimum number of responsive price feeds required to execute a liquidation | TBD | Needs engineering input |
| `rfq_expiry_seconds` | Duration an RFQ remains open for lender responses before auto-cancelling | TBD | Needs product input |
| `origination_signing_timeout_seconds` | Maximum time allowed for all three parties to sign the origination PSBT | TBD | Needs product input |
| `min_loan_amount_usd` | Minimum loan amount a borrower can request | TBD | Needs product input |
| `max_loan_amount_usd` | Maximum loan amount (may be constrained by available lender liquidity) | TBD | Needs product input |
| `min_loan_term_days` | Minimum loan term a borrower can request | TBD | Needs product input |
| `max_loan_term_days` | Maximum loan term | TBD | Needs product input |
| `on_chain_confirmation_threshold` | Number of Bitcoin block confirmations required before loan state transitions | TBD | Needs engineering input |
| `interest_precision_decimals` | Decimal precision for interest calculation | TBD | Needs engineering input |

---

## **15\. Future Considerations**

* **Securitization / secondary market:** Lender positions have a defined binary payoff at expiry and could be traded on a secondary market. The lender's position is economically equivalent to a covered call on BTC — it could be stripped into fixed-income and option components. This feature would enable a tradeable structured products layer on Bound. Design and specification deferred to a future version.  
* **Surplus return on default:** Rather than the lender keeping full BTC collateral on default, return any surplus above debt \+ penalty to the borrower. Requires a price oracle or pre-signed tiered transaction structure. Deferred to v2.  
* **Tiered origination fees:** Reduced fees for larger loan amounts to attract institutional borrowers.  
* **Partial repayment:** Allow borrowers to repay a portion of the loan and reduce their outstanding balance. Requires multisig restructuring or splitting.  
* **No-liquidation term loans (put option variant):** A version of the lending product where borrowers hold a co-signing key on a timelocked HTLC during the term, eliminating liquidation risk entirely. The borrower pays a higher rate in exchange for guaranteed downside protection. Documented in the original spec draft as a potential premium product tier.

