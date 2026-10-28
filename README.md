# Transaction Ledger API

A small, reliable REST API for creating accounts, recording immutable credits and debits, viewing balances and history, and (time permitting) transferring money atomically. This repository is scoped to the supplied Full Stack Developer Assessment; the optional UI is a thin operational demo, not a substitute for the backend requirements.

## Recommended implementation stack

- Node.js 22+ and TypeScript
- Fastify for HTTP routes and JSON Schema validation
- PostgreSQL 16+ as the source of truth
- Prisma ORM with SQL migrations; use parameterized SQL for row locking if Prisma's query API does not expose the needed lock
- Zod for request and environment validation
- Vitest for unit and integration tests
- Docker Compose for local PostgreSQL
- Optional web demo: React + Vite + TypeScript

Keep the stack simple enough to complete in 3–4 hours. Do not add authentication, a message broker, cloud infrastructure, or an LLM to this assignment unless explicitly requested by the evaluator.

## Quick start (target)

The commands below describe the intended developer experience; update package scripts to match the implementation.

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

API base URL: `http://localhost:3000/api/v1`

Health check: `GET /health`

## Required behavior

- New accounts always start at zero; callers cannot set a starting balance.
- Amounts are positive, finite currency values with at most two decimal places.
- A credit adds value; a debit succeeds only when sufficient funds exist.
- `(account_id, reference_id)` is unique. Retrying a reference returns the existing transaction and does not apply money twice.
- Each mutation of a transaction and its account balance is one database transaction.
- Ledger transactions are append-only through the API.
- History is latest first, paginated, and can filter by `credit` or `debit`.
- Errors use one predictable JSON envelope.

## Documentation

- [Architecture](architecture.md)
- [Implementation phases](phases.md)
- [API contract](api.md)
- [System design and data integrity](system-design.md)
- [UI design brief](design.md)
- [Assumptions and decisions](assumptions.md)
- [Antigravity build instructions](ANTIGRAVITY.md)

## Environment variables (target)

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://ledger:ledger@localhost:5432/ledger?schema=public
```

Never commit real credentials. Validate required environment values at startup and fail with a clear message.

## Submission checklist

- Source code and migrations
- This README with verified setup and run instructions
- API documentation (see `api.md`)
- Explicit assumptions (see `assumptions.md`)
- Example requests/responses or an importable OpenAPI document
- Automated coverage for validations, idempotency, insufficient funds, pagination, and atomicity
- Optional transfer endpoint only after the core requirements are complete

## Scope notes

This is a single-tenant assessment API. It has no authentication or authorization because the prompt does not define users, roles, or access control. State this clearly in the submission; do not present the unauthenticated demo as production-ready for real financial use.
