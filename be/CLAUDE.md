# CLAUDE.md

## Stack

- Node.js >= 20, Yarn 3 (Berry), NestJS, MongoDB (Mongoose), Redis + BullMQ
- Domain-agnostic skeleton — swap in any business logic

## Architecture

```
src/
├── commons/base-module/   # BaseService<T>, BaseEntity, BaseController — all services extend these
├── commons/constants/     # ENV_REGISTER, EVENT, TABLE_NAME, DATABASE_OPERATORS, RESPONSE_CODE
├── commons/types/         # Typed config interfaces (IAppConfig, IDatabaseConfig, IRedisConfig…)
├── configs/               # One registerAs() config file per env group
├── database/entities/     # All Mongoose schemas (export from index.ts)
├── modules/               # Feature modules (controller + service + type + dto/ per domain)
├── shared/                # Cross-cutting services (Redis, external APIs, etc.)
├── guards/                # ApiKeyGuard, RoleGuard
├── interceptors/          # ResponseInterceptor — wraps all responses in BaseResponseDto
├── decorators/            # @User, @Public, @Roles, @PaginateQuery, @DetailQuery
├── exceptions/            # AllExceptionFilter, HttpExceptionFilter
└── utils/                 # Stateless utilities (ArrayUtils, NumberUtil, common helpers)
```

## Base Patterns

- **Events**: Internal async events via `@nestjs/event-emitter`. Event names in `EVENT` constant — e.g. `this.eventEmitter.emit(EVENT.USER_CREATED, payload)`.
- **Config**: Always `configService.get<IXxxConfig>(ENV_REGISTER.XXX)` — never `process.env` directly.

## Coding Rules

### Modules

- One module per domain: `src/modules/<name>/` with `<name>.module.ts`, `.service.ts`, `.controller.ts`, `.type.ts`, `dto/`
- **`.type.ts` contains only enums, types, interfaces** — never DTO classes. All DTO classes live in `dto/<name>.dto.ts`.
- Register new entities in `src/database/entities/index.ts` and table names in `TABLE_NAME`.
- **Each module owns exactly one entity** — call `MongooseModule.forFeature` only for its own schema, never for another module's schema.
- **Never import a schema directly in another module** — import the owning module instead.
- **Entity modules export only their service** — consumers call the service, never `@InjectModel` for a foreign schema.

Example — module owns its schema and exports its service:
```ts
// user.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: TABLE_NAME.USER, schema: UserSchema }])],
  providers: [UserService],
  exports: [UserService], // export the service only
})
export class UserModule {}
```

Example — consumer imports the module, never the schema:
```ts
// post.module.ts
@Module({
  imports: [
    MongooseModule.forFeature([{ name: TABLE_NAME.POST, schema: PostSchema }]),
    UserModule, // import module to use UserService — never import UserSchema here
  ],
  controllers: [PostController],
  providers: [PostService],
  exports: [PostService],
})
export class PostModule {}
```

### Function Size

- **Keep every function under 40–50 lines.** If a function grows beyond this, extract focused private helpers — each doing one thing (e.g. `validateUserUniqueness`, `verifyCredentials`, `buildLoginResponse`).
- Public methods should read like an outline: call private helpers in sequence, not contain the implementation details themselves.

### Services

- Extend `BaseService<T>` — use `this.find()`, `this.findOne()`, `this.findOneOrThrow()`, etc.
- Use `findOneOrThrow` / `findOneByIdOrThrow` when entity must exist.
- Throw errors with `RESPONSE_CODE` constants: `throw new BadRequestException(RESPONSE_CODE.user.notFound)` — never raw strings.
- **Each service injects exactly one model — its own.** Never `@InjectModel` for another module's schema.
- **Never call `this.model` directly** — all DB access goes through methods defined in `BaseService<T>`. Add missing operations to `BaseService` first.
- **For cross-module DB access, inject the owning service** — never inject a foreign model.

Example — correct:
```ts
export class PostService extends BaseService<PostEntity> {
  constructor(
    @InjectModel(TABLE_NAME.POST)
    private readonly postModel: Model<PostEntity>, // only this service's own model
    private readonly userService: UserService,     // inject service for cross-module queries
  ) {
    super(postModel);
  }

  async getPost(postId: string) {
    const post = await this.findOneOrThrow({ _id: postId }); // ✓ BaseService method
    const user = await this.userService.findOne({ _id: post.userId }); // ✓ delegate to owning service
    // ✗ this.model.findOne(...)       — never call this.model directly
    // ✗ this.userModel.findOne(...)   — never inject or call a foreign model
  }
}
```

### Controllers

- Extend `BaseController<T>` for CRUD controllers, `GeneralController` for non-CRUD.
- Return via `this.response({ data, metaData })`.
- Always add `@ApiTags(...)` and `@ApiOperation({ summary: '...' })`.
- Add `@ApiPaginateQuery()` on paginated GET endpoints.
- Use `query.setCustomFilter(...)` for mandatory server-side filters.

### Guards

- `JwtAuthGuard` — user routes (use `@Public()` to opt out).
- `ApiKeyGuard` — internal service-to-service (HMAC-SHA256 via `x-hash` header).
- `@Roles(UserRole.ADMIN)` + `RolesGuard` — admin-only endpoints.

### Naming

- `camelCase` — variables, functions, object keys
- `PascalCase` — classes, DTOs, types, providers
- `SCREAMING_SNAKE_CASE` — constants and env keys
- Interfaces for method params: `IModuleNameMethodName` (e.g. `IUserServiceCreate`)
- Booleans: prefix with `is`, `has`, `should` — e.g. `isActive`, `hasPermission`
- Arrays/collections: always pluralize — e.g. `users`, `items`
- Avoid abbreviations except well-known ones: `id`, `dto`, `api`

### Enums

- **Never hardcode string literals** in conditions, assignments, or entity field values — define an enum in the module's `.type.ts` file and use it everywhere.
- Enum keys are `UPPER_SNAKE_CASE`; enum values are `lower_snake_case`.
- Name the enum `E<Domain><Field>` — e.g. `EUserRole`, `EUserStatus`, `EPostType`.

### Types

- **Never hardcode string literals** in conditions, assignments, or entity field values — define an type in the module's `.type.ts` file and use it everywhere.
- Types are `UpperCamelCase`.
- Name the type `T<Domain><Field>` — e.g. `TUserRole`, `TUserStatus`, `TPostType`.

### Interface

- **Never hardcode string literals** in conditions, assignments, or entity field values — define an interface in the module's `.type.ts` file and use it everywhere.
- Interfaces are `UpperCamelCase`.
- Name the interface `I<Domain><Field>` — e.g. `IUserRole`, `IUserStatus`, `IPostType`.

```ts
// user.type.ts
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

// user.entity.ts — use the enum as the field type
@Prop({ type: String, enum: UserRole, default: UserRole.USER })
role: UserRole;

// user.service.ts — compare with enum, never a raw string
const admins = await this.find({ role: UserRole.ADMIN });
if (user.role === UserRole.ADMIN) { ... }
```

### Testing

- **Always mock services, never models** — test files must never import `getModelToken` or mock Mongoose models directly. Inject mock services via `{ provide: SomeService, useValue: mockService }`.
- **Service mock shape** — each service mock must expose the same methods that `BaseService<T>` provides:
  ```ts
  const mockService = (overrides = {}) => ({
    findOne: jest.fn(),
    findOneOrThrow: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    paginate: jest.fn(),
    ...overrides,
  });
  ```
- **Module setup** — use `Test.createTestingModule` with `providers` only; never call `MongooseModule.forFeature` or register schemas in test modules.
  ```ts
  const module = await Test.createTestingModule({
    providers: [
      TargetService,
      { provide: UserService, useValue: mockUserService },
      { provide: ConfigService, useValue: mockConfigService },
      { provide: EventEmitter2, useValue: mockEventEmitter },
    ],
  }).compile();
  ```

## Anti-patterns

- Never use `process.env` directly — always `configService.get<IXxxConfig>(ENV_REGISTER.XXX)`
- Never throw raw string errors — always use `RESPONSE_CODE` constants
- Never use `any` — prefer `unknown` or create a proper type
- Never define `createdAt`/`updatedAt`/`deletedAt` on entities — `BaseEntity` provides them
- Never hardcode string literals for discriminator fields (`type`, `status`, `role`, etc.) — define an enum in the module's `.type.ts` and use it
- Never `@InjectModel` for a schema that belongs to another module — inject that module's service instead
- Never call `this.model` directly in a service — use `BaseService` methods; add new ones to `BaseService` if needed
- Never mock a Mongoose model in tests — always mock the owning service
- Never use `getModelToken` in test files — it signals you are mocking at the wrong layer
- Never call `.exec()` on results returned by `BaseService` — they are already resolved promises
- Never use `setTimeout`/`setInterval` in services — use BullMQ for async work

## Adding a New Feature Module

Follow this checklist when adding a new domain module:

1. **Create entity** in `src/database/entities/<name>.entity.ts` extending `BaseEntity<T>`
2. **Add table name** to `TABLE_NAME` in `src/commons/constants/database.constant.ts`
3. **Export entity** from `src/database/entities/index.ts`
4. **Create module directory** `src/modules/<name>/`
5. **Create `.type.ts`** — enums and interfaces only, no DTO classes
6. **Create `dto/`** — one DTO class per operation
7. **Create `.service.ts`** extending `BaseService<T>`, injecting only its own model
8. **Create `.controller.ts`** extending `BaseController<T>` or `GeneralController`
9. **Create `.module.ts`** — register own schema, export only the service
10. **Add to `AppModule`** imports
11. **Add error codes** for the new domain in `RESPONSE_CODE`
12. **Add events** to the `EVENT` constant if the module emits async events

## How to Generate an HMAC API Key (for testing ApiKeyGuard)

```ts
import * as crypto from 'crypto';

const secretKey = process.env.API_SECRET_KEY;
const secretWord = process.env.API_SECRET_WORD;
const timestamp = Date.now();
const message = `${secretWord}_${timestamp}`;
const hash = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
const xHash = `${hash}_${timestamp}`;
// Set header: x-hash: <xHash>
```
