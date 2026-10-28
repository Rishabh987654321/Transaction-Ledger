import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

describe("Transactions API Integration Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/accounts/:accountId/transactions - Credits and Debits", () => {
    it("successfully creates a credit and updates account balance atomically", async () => {
      // 1. Create account
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Alice Credit Test" },
      });
      const account = JSON.parse(accRes.body);

      // 2. Post credit
      const txRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "150.25",
          description: "Initial deposit",
          reference_id: "deposit-001",
        },
      });

      expect(txRes.statusCode).toBe(201);
      const tx = JSON.parse(txRes.body);
      expect(tx.id).toBeDefined();
      expect(tx.account_id).toBe(account.id);
      expect(tx.type).toBe("credit");
      expect(tx.amount).toBe("150.25");
      expect(tx.description).toBe("Initial deposit");
      expect(tx.reference_id).toBe("deposit-001");
      expect(tx.duplicate).toBe(false);
      expect(tx.created_at).toBeDefined();

      // 3. Verify balance
      const balRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/balance`,
      });
      const bal = JSON.parse(balRes.body);
      expect(bal.balance).toBe("150.25");
    });

    it("successfully creates a debit and reduces account balance atomically", async () => {
      // 1. Create account and fund it with 200.00
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Bob Debit Test" },
      });
      const account = JSON.parse(accRes.body);

      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "200.00",
          description: "Funding",
          reference_id: "fund-001",
        },
      });

      // 2. Post debit of 75.50
      const debitRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "debit",
          amount: "75.50",
          description: "Bill payment",
          reference_id: "bill-001",
        },
      });

      expect(debitRes.statusCode).toBe(201);
      const debit = JSON.parse(debitRes.body);
      expect(debit.type).toBe("debit");
      expect(debit.amount).toBe("75.50");
      expect(debit.duplicate).toBe(false);

      // 3. Verify balance is 124.50
      const balRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/balance`,
      });
      const bal = JSON.parse(balRes.body);
      expect(bal.balance).toBe("124.50");
    });

    it("rejects debit when funds are insufficient and leaves balance and ledger unchanged", async () => {
      // 1. Create account with 50.00
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Charlie Insufficient Funds" },
      });
      const account = JSON.parse(accRes.body);

      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "50.00",
          description: "Deposit",
          reference_id: "dep-charlie-1",
        },
      });

      // 2. Attempt debit of 50.01 (exceeds balance)
      const debitRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "debit",
          amount: "50.01",
          description: "Overdraft attempt",
          reference_id: "overdraft-001",
        },
      });

      expect(debitRes.statusCode).toBe(422);
      const err = JSON.parse(debitRes.body);
      expect(err.error.code).toBe("INSUFFICIENT_FUNDS");
      expect(err.error.message).toContain("Insufficient funds");
      expect(err.error.request_id).toBeDefined();

      // 3. Balance must remain exactly 50.00
      const balRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/balance`,
      });
      expect(JSON.parse(balRes.body).balance).toBe("50.00");

      // 4. Overdraft reference should NOT exist in database (can retry later)
      const retryAfterDeposit = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Top up",
          reference_id: "topup-001",
        },
      });
      expect(retryAfterDeposit.statusCode).toBe(201);

      // Now the previously failed reference_id can be used because it was never committed
      const retryDebit = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "debit",
          amount: "50.01",
          description: "Overdraft retry after top up",
          reference_id: "overdraft-001",
        },
      });
      expect(retryDebit.statusCode).toBe(201);
      expect(JSON.parse(retryDebit.body).duplicate).toBe(false);
    });
  });

  describe("Idempotency and Duplicate Semantics", () => {
    it("returns original transaction with 200 OK and duplicate: true without double-applying balance", async () => {
      // 1. Create account
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Dan Idempotency Test" },
      });
      const account = JSON.parse(accRes.body);

      // 2. First submission
      const firstRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Payment",
          reference_id: "pay-12345",
        },
      });
      expect(firstRes.statusCode).toBe(201);
      const firstTx = JSON.parse(firstRes.body);
      expect(firstTx.duplicate).toBe(false);

      // 3. Exact retry
      const retryRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Payment",
          reference_id: "pay-12345",
        },
      });
      expect(retryRes.statusCode).toBe(200);
      const retryTx = JSON.parse(retryRes.body);
      expect(retryTx.id).toBe(firstTx.id);
      expect(retryTx.duplicate).toBe(true);

      // 4. Retry with DIFFERENT payload (amount/description) still returns original without mutation
      const mismatchRetryRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "999.99",
          description: "Tampered description",
          reference_id: "pay-12345",
        },
      });
      expect(mismatchRetryRes.statusCode).toBe(200);
      const mismatchTx = JSON.parse(mismatchRetryRes.body);
      expect(mismatchTx.id).toBe(firstTx.id);
      expect(mismatchTx.amount).toBe("100.00");
      expect(mismatchTx.description).toBe("Payment");
      expect(mismatchTx.duplicate).toBe(true);

      // 5. Balance must be exactly 100.00 (not 200.00, not 1099.99)
      const balRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/balance`,
      });
      expect(JSON.parse(balRes.body).balance).toBe("100.00");
    });

    it("allows the same reference_id on different accounts independently", async () => {
      // Account 1
      const acc1Res = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "User One" },
      });
      const acc1 = JSON.parse(acc1Res.body);

      // Account 2
      const acc2Res = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "User Two" },
      });
      const acc2 = JSON.parse(acc2Res.body);

      const sharedRef = "shared-ref-xyz";

      const tx1 = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${acc1.id}/transactions`,
        payload: {
          type: "credit",
          amount: "40.00",
          description: "Shared ref test",
          reference_id: sharedRef,
        },
      });
      expect(tx1.statusCode).toBe(201);
      expect(JSON.parse(tx1.body).duplicate).toBe(false);

      const tx2 = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${acc2.id}/transactions`,
        payload: {
          type: "credit",
          amount: "60.00",
          description: "Shared ref test",
          reference_id: sharedRef,
        },
      });
      expect(tx2.statusCode).toBe(201);
      expect(JSON.parse(tx2.body).duplicate).toBe(false);
      expect(JSON.parse(tx1.body).id).not.toBe(JSON.parse(tx2.body).id);
    });
  });

  describe("Validation and Edge Cases", () => {
    it("rejects unknown account with 404 ACCOUNT_NOT_FOUND", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/accounts/00000000-0000-0000-0000-000000000000/transactions",
        payload: {
          type: "credit",
          amount: "10.00",
          description: "Deposit",
          reference_id: "ref-404",
        },
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("rejects invalid account UUID format with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/accounts/not-a-valid-uuid/transactions",
        payload: {
          type: "credit",
          amount: "10.00",
          description: "Deposit",
          reference_id: "ref-bad-uuid",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects invalid transaction types", async () => {
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Val Test" },
      });
      const account = JSON.parse(accRes.body);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "transfer",
          amount: "10.00",
          description: "Invalid type",
          reference_id: "ref-invalid-type",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects zero or negative amounts", async () => {
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Val Test 2" },
      });
      const account = JSON.parse(accRes.body);

      const zeroRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "0.00",
          description: "Zero amount",
          reference_id: "ref-zero",
        },
      });
      expect(zeroRes.statusCode).toBe(400);

      const negRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "-10.00",
          description: "Negative amount",
          reference_id: "ref-neg",
        },
      });
      expect(negRes.statusCode).toBe(400);
    });

    it("rejects excess decimal precision", async () => {
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Val Test 3" },
      });
      const account = JSON.parse(accRes.body);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "10.125",
          description: "Excess precision",
          reference_id: "ref-precision",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects extra unsupported fields in request body", async () => {
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Val Test 4" },
      });
      const account = JSON.parse(accRes.body);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "10.00",
          description: "Extra fields",
          reference_id: "ref-extra",
          balance_after: "100.00",
          id: "3f00ac76-5ce9-4e68-9f29-10a8a37cd8f1",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Concurrency & Serialization", () => {
    it("handles concurrent mutations on the same account without lost updates", async () => {
      // Create account
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Concurrent Tester" },
      });
      const account = JSON.parse(accRes.body);

      // Perform 5 concurrent credits of 10.00 each
      const credits = Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: "POST",
          url: `/api/v1/accounts/${account.id}/transactions`,
          payload: {
            type: "credit",
            amount: "10.00",
            description: `Concurrent credit ${i}`,
            reference_id: `concurrent-credit-${i}`,
          },
        })
      );

      const results = await Promise.all(credits);
      for (const res of results) {
        expect(res.statusCode).toBe(201);
      }

      // Balance must be exactly 50.00
      const balRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/balance`,
      });
      expect(JSON.parse(balRes.body).balance).toBe("50.00");
    });

    it("handles concurrent submissions with the same idempotency key cleanly", async () => {
      // Create account
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Race Idempotency Test" },
      });
      const account = JSON.parse(accRes.body);

      const refId = "race-ref-999";
      // Send 3 identical requests concurrently
      const requests = Array.from({ length: 3 }, () =>
        app.inject({
          method: "POST",
          url: `/api/v1/accounts/${account.id}/transactions`,
          payload: {
            type: "credit",
            amount: "25.00",
            description: "Race credit",
            reference_id: refId,
          },
        })
      );

      const responses = await Promise.all(requests);
      const statusCodes = responses.map((r) => r.statusCode).sort();

      // Exactly one should be 201 Created, and the other two should be 200 OK duplicate
      expect(statusCodes).toEqual([200, 200, 201]);

      // All responses must share the exact same transaction ID
      const txIds = responses.map((r) => JSON.parse(r.body).id);
      expect(new Set(txIds).size).toBe(1);

      // Balance must be exactly 25.00
      const balRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/balance`,
      });
      expect(JSON.parse(balRes.body).balance).toBe("25.00");
    });
  });
});
