# /build-module

Build a new NestJS feature module following CLAUDE.md patterns.

## Usage
`/build-module <module-name>`

## Steps
1. Read `be/CLAUDE.md` for coding rules
2. Read `SPEC.md` for business logic
3. Read `README.md` for API design + DB schema
4. Create the module following "Adding a New Feature Module" checklist:
   - Entity in `be/src/database/entities/<name>.entity.ts`
   - Add to `TABLE_NAME` constant
   - Export from `be/src/database/entities/index.ts`
   - Create `be/src/modules/<name>/` with:
     - `<name>.type.ts` (enums, interfaces only)
     - `dto/<name>.dto.ts` (DTO classes)
     - `<name>.service.ts` extending BaseService<T>
     - `<name>.controller.ts` extending BaseController or GeneralController
     - `<name>.module.ts` (register own schema, export service only)
   - Add to `AppModule` imports
   - Add error codes to `RESPONSE_CODE`
   - Add events to `EVENT` constant
5. Write unit tests (mock services, never models)
6. Run `npm test` to verify
7. Commit with conventional commit message
