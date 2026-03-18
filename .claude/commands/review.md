# /review

Review code against CLAUDE.md rules and SPEC.md business logic.

## Usage
`/review [file-or-module]`

## Checklist
1. **CLAUDE.md compliance:**
   - BaseService<T> used (no direct this.model calls)?
   - One model per service (own schema only)?
   - Cross-module access via service injection?
   - RESPONSE_CODE constants (no raw strings)?
   - Enums for all discriminator fields?
   - Functions under 40-50 lines?
   - No `process.env` (use configService)?
   - No `any` types?
   - Naming conventions (camelCase, PascalCase, SCREAMING_SNAKE)?

2. **SPEC.md compliance:**
   - Business rules match spec?
   - State transitions valid?
   - Escrow: 2-of-3 multisig, no timelocks?
   - Liquidation: oracle differential check ≤0.25%?
   - Grace period: 7 days?
   - Lenders: whitelisted?
   - Origination fee: added to principal debt?

3. **Security:**
   - PSBT validation before co-signing?
   - Manual review ≥0.20 BTC?
   - Auth guards on protected routes?
   - No secrets in code?

Report issues with file:line references.
