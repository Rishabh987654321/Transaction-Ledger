# Transaction Ledger API

A small, reliable REST API for creating accounts, recording immutable credits and debits, viewing balances and history, and (time permitting) transferring money atomically. This repository is scoped to the supplied Full Stack Developer Assessment; the optional UI is a thin operational demo, not a substitute for the backend requirements.

## Implementation stack

- Node.js 22+ and TypeScript (strict mode, ESM)
- Fastify for HTTP routes, lifecycle hooks, and error handling
- PostgreSQL 16+ as the source of truth
- Prisma ORM with custom SQL migrations for database-level check constraints
- Zod for runtime configuration and environment validation
- Docker Compose for local PostgreSQL

## Prerequisites

- Node.js 22.x+
- Docker and Docker Compose

## Quick start

Follow these verified steps to get the service running locally:

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start PostgreSQL in the background
docker compose up -d db

# 3. Install dependencies
npm install

# 4. Apply database migrations and generate Prisma client
npm run db:migrate

# 5. Start the API in development mode
npm run dev
```

API base URL: `http://localhost:3000/api/v1`

## Health and readiness checks

The server provides two diagnostic endpoints:

- `GET /health` (also at `/api/v1/health`): Lightweight liveness probe confirming the Node.js process is active and accepting requests without exposing internal system details. Returns `200 OK` with `{"status": "ok"}`.
- `GET /ready` (also at `/api/v1/ready`): Readiness check executing a minimal database ping (`SELECT 1`). Returns `200 OK` with `{"status": "ready"}` when PostgreSQL is reachable and ready to process traffic. If the database is unreachable or unresponsive, it safely returns `503 Service Unavailable` with `{"status": "unavailable", "message": "Database connection is unavailable"}`.

## Available package scripts

| Command                     | Action                                                               |
| --------------------------- | -------------------------------------------------------------------- |
| `npm run dev`               | Start development server with file watch via `tsx`                   |
| `npm run build`             | Compile TypeScript into `dist/`                                      |
| `npm start`                 | Run compiled production build from `dist/server.js`                  |
| `npm run typecheck`         | Run strict typechecking with `tsc --noEmit`                          |
| `npm run db:generate`       | Generate Prisma client bindings                                      |
| `npm run db:migrate`        | Apply schema migrations in development (`prisma migrate dev`)        |
| `npm run db:migrate:deploy` | Deploy pending migrations in production/CI (`prisma migrate deploy`) |

## Stopping the database

To stop the PostgreSQL container:

```bash
docker compose down
```

To stop and remove database volumes for a clean reset:

```bash
docker compose down -v
```

## Required behavior

- New accounts always start at zero; callers cannot set a starting balance.
- Amounts are positive, finite currency values with at most two decimal places.
- A credit adds value; a debit succeeds only when sufficient funds exist.
- `(account_id, reference_id)` is unique. Retrying a reference returns the existing transaction and does not apply money twice.
- Each mutation of a transaction and its account balance is one database transaction.
- Ledger transactions are append-only through the API.
- History is latest first, paginated, and can filter by `credit` or `debit`.
- Transfers atomically debit source, credit destination, and link paired immutable ledger entries with deadlock-free lock ordering.
- Errors use one predictable JSON envelope.

## Documentation

- [Architecture](architecture.md)
- [API contract](api.md)
- [System design and data integrity](system-design.md)

## Environment variables

Configured in `.env` (derived from `.env.example`):

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://ledger:ledger@localhost:5432/ledger?schema=public
```

Required environment values are validated at startup with safe error messages.
