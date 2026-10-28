# API Contract

Base path: `/api/v1`  
Content type: `application/json`  
IDs: UUID strings. Timestamps: ISO 8601 UTC.  
Money: decimal strings with exactly two fractional digits (for example `"25.00"`); input allows one or two decimal places and is converted to integer paise. Do not use JSON floating-point values.

## `POST /accounts`

Create an account. Server generates `id`, `created_at`, and a zero balance.

Request:

```json
{ "name": "Aarav Sharma" }
```

Reject unknown fields such as `balance`, or safely ignore them while ensuring they cannot influence persisted balance. Recommended strict schema: reject with 400.

201 response:

```json
{
  "id": "3f00ac76-5ce9-4e68-9f29-10a8a37cd8f1",
  "name": "Aarav Sharma",
  "balance": "0.00",
  "created_at": "2026-10-28T10:00:00.000Z"
}
```

## `POST /accounts/:accountId/transactions`

Create a credit or debit. `reference_id` is unique per account and provides retry-safe idempotency.

Request:

```json
{
  "type": "credit",
  "amount": "125.50",
  "description": "October reimbursement",
  "reference_id": "reimbursement-2026-10"
}
```

Created: `201 Created`, response:

```json
{
  "id": "e27c06e8-6c9a-4bdb-8022-7e68c04bc7d9",
  "account_id": "3f00ac76-5ce9-4e68-9f29-10a8a37cd8f1",
  "type": "credit",
  "amount": "125.50",
  "description": "October reimbursement",
  "reference_id": "reimbursement-2026-10",
  "created_at": "2026-10-28T10:01:00.000Z",
  "duplicate": false
}
```

Duplicate reference for the same account: `200 OK`, return the original transaction with `duplicate: true`. Do not replay the balance mutation. The client can fetch the current balance from the balance endpoint. If the same reference is reused with a different payload, still do not create or apply another transaction; return the original transaction and indicate duplicate. This makes retries safe. Reference IDs are scoped to an account.

Debit with insufficient funds: `422 Unprocessable Entity`, error code `INSUFFICIENT_FUNDS`.

## `GET /accounts/:accountId/balance`

200 response:

```json
{
  "account_id": "3f00ac76-5ce9-4e68-9f29-10a8a37cd8f1",
  "balance": "125.50"
}
```

Unknown account: 404 `ACCOUNT_NOT_FOUND`.

## `GET /accounts/:accountId/transactions`

Query parameters:

- `type`: optional `credit` or `debit`; omit to return both.
- `page`: optional positive integer; default `1`.
- `limit`: optional integer from `1` to `100`; default `20`.

Order: `created_at DESC`, then `id DESC` for a stable tie-break.

200 response:

```json
{
  "data": [
    {
      "id": "e27c06e8-6c9a-4bdb-8022-7e68c04bc7d9",
      "account_id": "3f00ac76-5ce9-4e68-9f29-10a8a37cd8f1",
      "type": "credit",
      "amount": "125.50",
      "description": "October reimbursement",
      "reference_id": "reimbursement-2026-10",
      "created_at": "2026-10-28T10:01:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Unknown account: 404. Invalid type/page/limit: 400 `VALIDATION_ERROR`.

## `POST /transfers`

Atomically debits source account and credits destination account as one all-or-nothing database operation.

Request:

```json
{
  "source_account_id": "3f00ac76-5ce9-4e68-9f29-10a8a37cd8f1",
  "destination_account_id": "44da4aa3-7636-4af6-a86c-e7b80946b27c",
  "amount": "30.00",
  "description": "Shared expense",
  "reference_id": "transfer-2026-10-28-001"
}
```

201 response (`duplicate: false`):

```json
{
  "id": "c7a840e6-b9b2-4d51-8668-3e4b3cfae231",
  "source_account_id": "3f00ac76-5ce9-4e68-9f29-10a8a37cd8f1",
  "destination_account_id": "44da4aa3-7636-4af6-a86c-e7b80946b27c",
  "amount": "30.00",
  "description": "Shared expense",
  "reference_id": "transfer-2026-10-28-001",
  "created_at": "2026-10-28T10:05:00.000Z",
  "entries": [
    {
      "id": "d04e58b3-3a1e-450f-a9cb-b09e25d4816c",
      "account_id": "3f00ac76-5ce9-4e68-9f29-10a8a37cd8f1",
      "type": "debit",
      "amount": "30.00",
      "description": "Shared expense",
      "reference_id": "transfer:c7a840e6-b9b2-4d51-8668-3e4b3cfae231:debit",
      "created_at": "2026-10-28T10:05:00.000Z"
    },
    {
      "id": "e15f69c4-4b2f-5610-badc-c1af36e5927d",
      "account_id": "44da4aa3-7636-4af6-a86c-e7b80946b27c",
      "type": "credit",
      "amount": "30.00",
      "description": "Shared expense",
      "reference_id": "transfer:c7a840e6-b9b2-4d51-8668-3e4b3cfae231:credit",
      "created_at": "2026-10-28T10:05:00.000Z"
    }
  ],
  "duplicate": false
}
```

Duplicate reference for the same source account: `200 OK`, return the original transfer with `duplicate: true` and linked entries without re-applying money.

- Insufficient funds: 422 `INSUFFICIENT_FUNDS`.
- Missing source or destination account: 404 `ACCOUNT_NOT_FOUND`.
- Same source and destination: 400 `VALIDATION_ERROR`.
- Idempotency key is `(source_account_id, reference_id)`. Internal ledger rows use transfer-scoped references `transfer:<transferId>:debit` and `transfer:<transferId>:credit` linked by `transfer_id`.

## Error envelope

All errors use:

```json
{
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "Account was not found.",
    "details": [],
    "request_id": "req_01J..."
  }
}
```

`details` may contain safe field-level validation messages. Never expose stack traces, SQL, or secrets.

## Status codes

| Status | Meaning |
|---|---|
| 200 | Read success or idempotent duplicate response |
| 201 | Account / transaction / transfer created |
| 400 | Invalid JSON, validation, or query parameter |
| 404 | Account not found |
| 409 | Optional use for a conflicting non-idempotent operation; duplicate transaction retries use 200 |
| 422 | Valid request rejected by a domain rule, such as insufficient funds |
| 500 | Unexpected internal error |

## Validation rules

- `name`: required, trimmed, 1–120 characters.
- `type`: exactly `credit` or `debit`.
- `amount`: positive decimal, maximum two fractional digits, within database range.
- `description`: required, trimmed, 1–500 characters.
- `reference_id`: required, trimmed, 1–128 characters.
- `accountId`: syntactically valid UUID and existing row.
- Reject `NaN`, exponent forms, negative/zero amounts, and excess decimal precision.
- Reject unsupported extra fields in request bodies for predictable behavior.
