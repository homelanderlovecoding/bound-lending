# /add-endpoint

Add a new API endpoint to an existing module.

## Usage
`/add-endpoint <module-name> <METHOD> <path> <description>`

## Steps
1. Read `be/CLAUDE.md` for controller patterns
2. Read `README.md` API Design section for endpoint contract
3. Add DTO in `be/src/modules/<module>/dto/` if needed
4. Add service method in `<module>.service.ts`
5. Add controller route in `<module>.controller.ts`:
   - `@ApiTags(...)` and `@ApiOperation({ summary: '...' })`
   - Return via `this.response({ data })`
   - Use guards: `@ApiBearerAuth()`, `@Public()`, `@Roles()` as needed
6. Run `npm test` to verify nothing broke
7. Commit
