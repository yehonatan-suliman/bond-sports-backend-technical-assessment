# Bond Sports – Account Management API

REST API for managing bank-style accounts and transactions. Built with **TypeScript**, **NestJS 11**, **PostgreSQL**, **Prisma 7**.

## Features

- Create, fetch, list, block / activate accounts
- Update daily withdrawal limits
- Deposit and withdraw money with:
  - Active-account check
  - Sufficient-balance check on withdrawal
  - Daily-withdrawal-limit check (UTC day window) on withdrawal
  - Serializable DB transaction + `SELECT … FOR UPDATE` row lock to prevent race conditions
- Account statement filtered by period (`from` / `to`), with totals (deposits, withdrawals, net)
- Global request validation via `zod` schemas (single source of truth for runtime + types)
- Centralized Prisma error → HTTP mapping
- Swagger / OpenAPI documentation at `/docs`

## Tech Stack

| Concern | Choice |
| --- | --- |
| Runtime / framework | NestJS 11 + Node 20 |
| Language | TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 (with `@prisma/adapter-pg`) |
| Validation | `zod` + `nestjs-zod` |
| Money math | `decimal.js` (2-decimal `ROUND_HALF_UP`) |
| API docs | `@nestjs/swagger` |
| Tests | Jest 30 + Supertest |

Non-standard library notes:

- **`decimal.js`** — JS `number` is a 64-bit float and silently loses precision on common money values (e.g. `0.1 + 0.2`). All amounts go through `toMoney(...)` which normalizes to 2-decimal-place `Decimal` values before any arithmetic or persistence.
- **`@prisma/adapter-pg`** — required by Prisma 7's new client architecture; replaces the legacy binary engine with the native `pg` driver.
- **`zod` + `nestjs-zod`** — chosen over `class-validator` because schemas are plain values (composable, testable, no decorators / reflect-metadata), single source of truth for both runtime validation and TypeScript types (`z.infer<...>`), and integrates with Swagger via `cleanupOpenApiDoc`.

## Project Structure

```
src/
├── common/                 shared utilities (money, constants, exception filter)
├── database/               Global Prisma module (DatabaseService extends PrismaClient)
├── modules/
│   ├── accounts/           Accounts feature (controller, service, repo, DTOs)
│   └── transactions/       Transactions feature (deposit, withdraw, statement)
├── generated/prisma/       Prisma client (gitignored — generated from schema)
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma
└── migrations/             versioned SQL migrations
test/
└── accounts.e2e-spec.ts    end-to-end test against a real Postgres
```

Each feature module follows the same controller → service → repository layering, so the surface area can grow without bleeding business rules into transport layers.

## Prerequisites

- Node.js 20+
- Yarn (or npm)
- PostgreSQL 16+ — either local, Docker, or hosted (e.g. Prisma Postgres)

## Setup

```bash
# 1. Install dependencies
yarn install

# 2. Configure environment
cp .env.example .env          # PowerShell: copy .env.example .env
# edit DATABASE_URL to point at your Postgres instance

# 3. Generate the Prisma client
#    (re-run any time prisma/schema.prisma changes)
yarn prisma:generate

# 4. Apply migrations
yarn prisma:migrate
```

### One-shot local stack via Docker

```bash
docker compose up -d           # starts Postgres + the API
docker compose logs -f api     # watch startup / migrations
```

The compose file applies `prisma migrate deploy` automatically before starting the API.

## Run

```bash
yarn start           # production-style (compiles via `nest start`)
yarn start:dev       # watch mode
yarn build && yarn start:prod   # build + run compiled dist
```

The API listens on `http://localhost:3000` by default (`PORT` env var to override).

Swagger UI: **http://localhost:3000/docs**

## Tests

```bash
yarn test            # unit tests (services with mocked repositories)
yarn test:cov        # unit tests + coverage report (in /coverage)
yarn test:e2e        # end-to-end against the live DB pointed to by DATABASE_URL
```

The e2e suite creates a unique `personId` per run, exercises all endpoints, and cleans up its own data in `afterAll`.

## API

All endpoints are mounted under `/accounts`. The full spec is in Swagger; quick reference:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/accounts` | Create an account |
| `GET` | `/accounts?…` | Search accounts by optional filters (`accountId`, `personId`, `accountType`, `activeFlag`, `balance`/`minBalance`/`maxBalance`, `dailyWithdrawalLimit`/`minDailyWithdrawalLimit`/`maxDailyWithdrawalLimit`) |
| `GET` | `/accounts/:accountId` | Get one account |
| `PATCH` | `/accounts/:accountId/limit` | Update daily withdrawal limit |
| `PATCH` | `/accounts/:accountId/block` | Block (deactivate) account |
| `PATCH` | `/accounts/:accountId/activate` | Reactivate a blocked account |
| `POST` | `/accounts/:accountId/deposits` | Deposit money |
| `POST` | `/accounts/:accountId/withdrawals` | Withdraw money |
| `GET` | `/transactions?…` | Search transactions by optional filters (`accountId`, `type`, `value`/`minValue`/`maxValue`, `from`/`to`). Response includes the matching list plus `totalDeposits`, `totalWithdrawals`, `netAmount`. |

### Example: create an account

```bash
curl -X POST http://localhost:3000/accounts \
  -H 'Content-Type: application/json' \
  -d '{
    "personId": "123456789",
    "accountType": 1,
    "dailyWithdrawalLimit": 500,
    "initialBalance": 1000
  }'
```

`accountType`: request accepts `"CHECKING"`/`"SAVINGS"` or `1`/`2`; responses always return the name (`"CHECKING"` or `"SAVINGS"`).

**Withdrawal rules:**
- **CHECKING** accounts may go negative (overdraft is allowed). The daily withdrawal limit still applies.
- **SAVINGS** accounts cannot go negative — a withdrawal exceeding the balance is rejected with `422 Savings account balance cannot go negative`.

### Example: search transactions

```bash
curl "http://localhost:3000/transactions?accountId=$ID&type=WITHDRAWAL&minValue=100&from=2026-05-01T00:00:00Z&to=2026-05-31T23:59:59Z"
```

All filters are optional. Response includes the matching transaction list plus `totalDeposits`, `totalWithdrawals`, and `netAmount` over the filtered set.

## Error Handling

All errors return JSON of the form:

```json
{ "statusCode": 422, "message": "Insufficient balance", "error": "UNPROCESSABLE_ENTITY" }
```

| Scenario | Status |
| --- | --- |
| Validation failure (`zod` / `nestjs-zod`) | `400 Bad Request` |
| Account / record not found | `404 Not Found` |
| Account blocked | `403 Forbidden` |
| Insufficient balance or daily limit exceeded | `422 Unprocessable Entity` |
| Unique / FK violation from DB | `409 / 400` (via `PrismaExceptionFilter`) |
| Anything else | `500 Internal Server Error` |

## Concurrency & Money Safety

- Every deposit/withdrawal runs inside `prisma.$transaction(…, { isolationLevel: 'Serializable' })`.
- The account row is locked with `SELECT … FOR UPDATE` at the start of the transaction, so two concurrent withdrawals against the same account serialize and the daily-limit check sees the up-to-date sum.
- All amounts are stored as `DECIMAL(18, 2)` in Postgres and normalized through `decimal.js` in the application — no floating-point drift.

## Useful Scripts

| Script | Purpose |
| --- | --- |
| `yarn prisma:generate` | Regenerate the Prisma client (`src/generated/prisma`) |
| `yarn prisma:migrate` | Create / apply migrations in dev (interactive) |
| `yarn build` | Compile to `dist/` |
| `yarn start:dev` | Run the API in watch mode |
| `yarn test` / `yarn test:cov` / `yarn test:e2e` | Unit / coverage / end-to-end tests |
| `yarn lint` | ESLint with autofix |
| `yarn format` | Prettier write |
