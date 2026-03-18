# /test

Run tests and fix failures.

## Usage
`/test [module-name]`

## Steps
1. If module specified: `cd be && npx jest --testPathPattern=<module>`
2. If no module: `cd be && npx jest`
3. If tests fail:
   - Read the error output
   - Fix the issue in source or test
   - Re-run until green
4. Report: X passed, Y failed, coverage summary

## Testing Rules (from CLAUDE.md)
- Mock services, never models
- No `getModelToken` in tests
- Use `Test.createTestingModule` with providers only
- Service mocks must expose BaseService methods (findOne, findOneOrThrow, etc.)
