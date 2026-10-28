import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

describe("Transfers API Integration Tests (POST /api/v1/transfers)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Successful Atomic Transfers", () => {
    it("atomically debits source, credits destination, and links ledger rows", async () => {
      // 1. Create source account and seed with 100.00
      const srcRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Transfer Source 1" },
      });
      const source = JSON.parse(srcRes.body);

      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${source.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Seed funds",
          reference_id: "seed-src-1",
        },
      });

      // 2. Create destination account (starts with 0.00)
      const dstRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Transfer Dest 1" },
      });
      const destination = JSON.parse(dstRes.body);

      // 3. Execute transfer of 40.00
      const transferRes = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: source.id,
          destination_account_id: destination.id,
          amount: "40.00",
          description: "Split dinner bill",
          reference_id: "transfer-bill-001",
        },
      });

      expect(transferRes.statusCode).toBe(201);
      const transfer = JSON.parse(transferRes.body);
      expect(transfer.id).toBeDefined();
      expect(transfer.source_account_id).toBe(source.id);
      expect(transfer.destination_account_id).toBe(destination.id);
      expect(transfer.amount).toBe("40.00");
      expect(transfer.description).toBe("Split dinner bill");
      expect(transfer.reference_id).toBe("transfer-bill-001");
      expect(transfer.duplicate).toBe(false);
      expect(transfer.entries.length).toBe(2);

      const debitEntry = transfer.entries.find(
        (e: any) => e.account_id === source.id
      );
      const creditEntry = transfer.entries.find(
        (e: any) => e.account_id === destination.id
      );
      expect(debitEntry.type).toBe("debit");
      expect(debitEntry.amount).toBe("40.00");
      expect(creditEntry.type).toBe("credit");
      expect(creditEntry.amount).toBe("40.00");

      // 4. Verify balances
      const srcBalRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${source.id}/balance`,
      });
      expect(JSON.parse(srcBalRes.body).balance).toBe("60.00");

      const dstBalRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${destination.id}/balance`,
      });
      expect(JSON.parse(dstBalRes.body).balance).toBe("40.00");

      // 5. Verify transaction history contains linked rows
      const srcHist = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${source.id}/transactions`,
      });
      const srcHistBody = JSON.parse(srcHist.body);
      expect(srcHistBody.data[0].id).toBe(debitEntry.id);

      const dstHist = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${destination.id}/transactions`,
      });
      const dstHistBody = JSON.parse(dstHist.body);
      expect(dstHistBody.data[0].id).toBe(creditEntry.id);
    });
  });

  describe("Transfer Idempotency & Retries", () => {
    it("returns original transfer with 200 OK and duplicate: true without moving funds again", async () => {
      // Create source and dest
      const srcRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Idempotent Src" },
      });
      const source = JSON.parse(srcRes.body);
      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${source.id}/transactions`,
        payload: {
          type: "credit",
          amount: "150.00",
          description: "Initial",
          reference_id: "init-idem-src",
        },
      });

      const dstRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Idempotent Dst" },
      });
      const destination = JSON.parse(dstRes.body);

      const transferPayload = {
        source_account_id: source.id,
        destination_account_id: destination.id,
        amount: "50.00",
        description: "Shared payment",
        reference_id: "shared-tx-ref-123",
      };

      // First call
      const firstRes = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: transferPayload,
      });
      expect(firstRes.statusCode).toBe(201);
      const firstTransfer = JSON.parse(firstRes.body);
      expect(firstTransfer.duplicate).toBe(false);

      // Exact retry
      const retryRes = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: transferPayload,
      });
      expect(retryRes.statusCode).toBe(200);
      const retryTransfer = JSON.parse(retryRes.body);
      expect(retryTransfer.id).toBe(firstTransfer.id);
      expect(retryTransfer.duplicate).toBe(true);

      // Tampered retry
      const tamperedRes = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          ...transferPayload,
          amount: "999.00",
          description: "Altered amount",
        },
      });
      expect(tamperedRes.statusCode).toBe(200);
      const tamperedTransfer = JSON.parse(tamperedRes.body);
      expect(tamperedTransfer.id).toBe(firstTransfer.id);
      expect(tamperedTransfer.amount).toBe("50.00");
      expect(tamperedTransfer.duplicate).toBe(true);

      // Balances must reflect ONLY the 50.00 transfer
      const srcBal = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${source.id}/balance`,
      });
      expect(JSON.parse(srcBal.body).balance).toBe("100.00");

      const dstBal = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${destination.id}/balance`,
      });
      expect(JSON.parse(dstBal.body).balance).toBe("50.00");
    });

    it("allows the same transfer reference on a different source account independently", async () => {
      const src1 = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Src One" },
          })
        ).body
      );
      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${src1.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Top up",
          reference_id: "topup-s1",
        },
      });

      const src2 = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Src Two" },
          })
        ).body
      );
      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${src2.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Top up",
          reference_id: "topup-s2",
        },
      });

      const dst = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Dst Common" },
          })
        ).body
      );

      const commonRef = "common-ref-111";

      const t1 = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: src1.id,
          destination_account_id: dst.id,
          amount: "20.00",
          description: "Transfer from S1",
          reference_id: commonRef,
        },
      });
      expect(t1.statusCode).toBe(201);

      const t2 = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: src2.id,
          destination_account_id: dst.id,
          amount: "30.00",
          description: "Transfer from S2",
          reference_id: commonRef,
        },
      });
      expect(t2.statusCode).toBe(201);
      expect(JSON.parse(t1.body).id).not.toBe(JSON.parse(t2.body).id);
    });
  });

  describe("Insufficient Funds and Failures", () => {
    it("returns 422 INSUFFICIENT_FUNDS when source balance is inadequate", async () => {
      const src = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Poor Source" },
          })
        ).body
      );
      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${src.id}/transactions`,
        payload: {
          type: "credit",
          amount: "25.00",
          description: "Small fund",
          reference_id: "fund-small",
        },
      });

      const dst = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Rich Dest" },
          })
        ).body
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: src.id,
          destination_account_id: dst.id,
          amount: "30.00",
          description: "Overdraw transfer",
          reference_id: "overdraw-tx-001",
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("INSUFFICIENT_FUNDS");

      // Verify no records inserted
      const transferCount = await app.prisma.transfer.count({
        where: { referenceId: "overdraw-tx-001" },
      });
      expect(transferCount).toBe(0);

      // Verify balances unchanged
      const srcBal = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${src.id}/balance`,
      });
      expect(JSON.parse(srcBal.body).balance).toBe("25.00");

      const dstBal = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${dst.id}/balance`,
      });
      expect(JSON.parse(dstBal.body).balance).toBe("0.00");
    });
  });

  describe("Validation and Edge Cases", () => {
    it("rejects transfer between same source and destination with 400", async () => {
      const account = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Self Transfer Account" },
          })
        ).body
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: account.id,
          destination_account_id: account.id,
          amount: "10.00",
          description: "Self transfer",
          reference_id: "self-tx-1",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 when source or destination account does not exist", async () => {
      const realAccount = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Real Account" },
          })
        ).body
      );
      const fakeId = "00000000-0000-0000-0000-000000000000";

      // Missing source
      const res1 = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: fakeId,
          destination_account_id: realAccount.id,
          amount: "10.00",
          description: "Missing src",
          reference_id: "ref-miss-src",
        },
      });
      expect(res1.statusCode).toBe(404);
      expect(JSON.parse(res1.body).error.code).toBe("ACCOUNT_NOT_FOUND");

      // Missing destination
      const res2 = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: realAccount.id,
          destination_account_id: fakeId,
          amount: "10.00",
          description: "Missing dst",
          reference_id: "ref-miss-dst",
        },
      });
      expect(res2.statusCode).toBe(404);
      expect(JSON.parse(res2.body).error.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("rejects extra unknown fields with 400", async () => {
      const realAccount = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Account For Extra Field Test" },
          })
        ).body
      );
      const realAccount2 = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "Account For Extra Field Test 2" },
          })
        ).body
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: realAccount.id,
          destination_account_id: realAccount2.id,
          amount: "10.00",
          description: "Valid",
          reference_id: "ref-extra-transfer",
          fee: "1.00", // extra field
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Deadlock Prevention - Concurrent Opposite-Direction Transfers", () => {
    it("handles concurrent opposite transfers without deadlocking", async () => {
      // Account A: 100.00, Account B: 100.00
      const accA = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "User A" },
          })
        ).body
      );
      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${accA.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Fund A",
          reference_id: "fund-a",
        },
      });

      const accB = JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/accounts",
            payload: { name: "User B" },
          })
        ).body
      );
      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${accB.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Fund B",
          reference_id: "fund-b",
        },
      });

      // Transfer 1: A -> B (30.00)
      // Transfer 2: B -> A (50.00)
      const t1 = app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: accA.id,
          destination_account_id: accB.id,
          amount: "30.00",
          description: "A to B",
          reference_id: "cross-ab-001",
        },
      });

      const t2 = app.inject({
        method: "POST",
        url: "/api/v1/transfers",
        payload: {
          source_account_id: accB.id,
          destination_account_id: accA.id,
          amount: "50.00",
          description: "B to A",
          reference_id: "cross-ba-001",
        },
      });

      const [res1, res2] = await Promise.all([t1, t2]);
      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);

      // Final balances:
      // A: 100 - 30 + 50 = 120.00
      // B: 100 + 30 - 50 = 80.00
      const balA = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${accA.id}/balance`,
      });
      expect(JSON.parse(balA.body).balance).toBe("120.00");

      const balB = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${accB.id}/balance`,
      });
      expect(JSON.parse(balB.body).balance).toBe("80.00");
    });
  });
});
