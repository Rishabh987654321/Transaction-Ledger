import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { AccountRepository } from "../../src/repositories/account-repository.js";
import { TransactionRepository } from "../../src/repositories/transaction-repository.js";
import { LedgerService } from "../../src/services/ledger-service.js";
import type { FastifyInstance } from "fastify";

describe("Phase 4 Data Integrity & Robustness Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Failure Injection & Rollback Verification", () => {
    it("rolls back transaction row when an unexpected failure occurs before balance update commits", async () => {
      const accountRepo = new AccountRepository(app.prisma);
      const transactionRepo = new TransactionRepository(app.prisma);
      const ledgerService = new LedgerService(
        app.prisma,
        accountRepo,
        transactionRepo
      );

      // Create an account
      const account = await accountRepo.create("Rollback Test Account");

      // Spy on updateBalance and inject an error
      const updateBalanceSpy = vi
        .spyOn(accountRepo, "updateBalance")
        .mockRejectedValueOnce(
          new Error("Simulated failure during balance projection update")
        );

      const refId = "rollback-test-ref-001";

      await expect(
        ledgerService.createTransaction({
          accountId: account.id,
          type: "credit",
          amountMinor: 5000n, // 50.00
          description: "Will fail",
          referenceId: refId,
        })
      ).rejects.toThrow("Simulated failure during balance projection update");

      // Verify rollback in DB:
      // 1. Balance must still be 0
      const freshAccount = await app.prisma.account.findUnique({
        where: { id: account.id },
      });
      expect(freshAccount?.balanceMinor).toBe(0n);

      // 2. Transaction row must NOT exist
      const orphanTx = await app.prisma.transaction.findUnique({
        where: {
          accountId_referenceId: {
            accountId: account.id,
            referenceId: refId,
          },
        },
      });
      expect(orphanTx).toBeNull();

      updateBalanceSpy.mockRestore();
    });
  });

  describe("Concurrent Debits Overdraft Protection", () => {
    it("prevents concurrent debits from overdrawing account balance", async () => {
      // 1. Create account with 100.00
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Overdraw Race Account" },
      });
      const account = JSON.parse(accRes.body);

      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "100.00",
          description: "Seed balance",
          reference_id: "seed-100",
        },
      });

      // 2. Fire 3 concurrent debits of 60.00 each (total 180.00, only 1 can succeed)
      const debitRequests = [1, 2, 3].map((i) =>
        app.inject({
          method: "POST",
          url: `/api/v1/accounts/${account.id}/transactions`,
          payload: {
            type: "debit",
            amount: "60.00",
            description: `Concurrent debit ${i}`,
            reference_id: `concurrent-debit-${i}`,
          },
        })
      );

      const responses = await Promise.all(debitRequests);
      const statusCodes = responses.map((r) => r.statusCode).sort();

      // Exactly one 201, two 422s
      expect(statusCodes).toEqual([201, 422, 422]);

      // 3. Balance must be exactly 40.00 (100.00 - 60.00)
      const balRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/balance`,
      });
      expect(JSON.parse(balRes.body).balance).toBe("40.00");

      // 4. Ledger row count for this account must be exactly 2 (seed credit + 1 successful debit)
      const txCount = await app.prisma.transaction.count({
        where: { accountId: account.id },
      });
      expect(txCount).toBe(2);
    });
  });

  describe("Database Constraints Direct Enforcement", () => {
    it("enforces non-negative balance constraint at database level", async () => {
      const account = await app.prisma.account.create({
        data: { name: "DB Constraint Account", balanceMinor: 0n },
      });

      // Direct SQL attempt to violate check constraint
      await expect(
        app.prisma.$executeRaw`UPDATE "accounts" SET "balance_minor" = -500 WHERE "id" = ${account.id}::uuid`
      ).rejects.toThrow(/accounts_balance_minor_non_negative/);
    });

    it("enforces positive amount constraint at database level", async () => {
      const account = await app.prisma.account.create({
        data: { name: "DB Constraint Tx Account", balanceMinor: 0n },
      });

      // Direct SQL attempt with amount_minor = 0
      await expect(
        app.prisma.$executeRaw`INSERT INTO "transactions" ("id", "account_id", "type", "amount_minor", "description", "reference_id")
         VALUES (gen_random_uuid(), ${account.id}::uuid, 'credit', 0, 'Zero amount', 'ref-zero-db')`
      ).rejects.toThrow(/transactions_amount_minor_positive/);
    });

    it("enforces valid type constraint at database level", async () => {
      const account = await app.prisma.account.create({
        data: { name: "DB Constraint Type Account", balanceMinor: 0n },
      });

      // Direct SQL attempt with invalid type
      await expect(
        app.prisma.$executeRaw`INSERT INTO "transactions" ("id", "account_id", "type", "amount_minor", "description", "reference_id")
         VALUES (gen_random_uuid(), ${account.id}::uuid, 'transfer', 100, 'Invalid type', 'ref-type-db')`
      ).rejects.toThrow(/transactions_type_valid/);
    });
  });

  describe("Pagination Offset & Bounds Protection", () => {
    it("rejects unsafe or excessively large page numbers with 400 VALIDATION_ERROR", async () => {
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Pagination Safety Account" },
      });
      const account = JSON.parse(accRes.body);

      // Page exceeding MAX_PAGE (100,000)
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/transactions?page=100001`,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");

      // Extreme unsafe integer page
      const extremeRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/transactions?page=99999999999999999999`,
      });
      expect(extremeRes.statusCode).toBe(400);
      expect(JSON.parse(extremeRes.body).error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Money Bounds & Overflow Safety", () => {
    it("safely rejects transaction when balance would exceed 64-bit integer limit", async () => {
      // Create an account with balance near MAX_BIGINT_64
      const nearMax = 9223372036854775800n; // 7 units away from MAX_BIGINT_64
      const account = await app.prisma.account.create({
        data: {
          name: "Near Max Account",
          balanceMinor: nearMax,
        },
      });

      // Try to credit 1.00 (100 paise), which would push balance over MAX_BIGINT_64
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "1.00",
          description: "Overflow credit",
          reference_id: "overflow-ref-1",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("Balance exceeds maximum");

      // Account balance must remain unchanged
      const fresh = await app.prisma.account.findUnique({
        where: { id: account.id },
      });
      expect(fresh?.balanceMinor).toBe(nearMax);
    });
  });

  describe("Tampered Retry Payload Invariance", () => {
    it("returns original transaction and leaves balance unchanged when retry alters amount and type", async () => {
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Tamper Test Account" },
      });
      const account = JSON.parse(accRes.body);

      // Initial credit of 30.00
      const firstRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: "30.00",
          description: "Original Payment",
          reference_id: "tamper-ref-001",
        },
      });
      expect(firstRes.statusCode).toBe(201);
      const originalTx = JSON.parse(firstRes.body);

      // Tampered retry with amount 300.00 and type debit
      const retryRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "debit",
          amount: "300.00",
          description: "Tampered Description",
          reference_id: "tamper-ref-001",
        },
      });

      expect(retryRes.statusCode).toBe(200);
      const retryTx = JSON.parse(retryRes.body);
      expect(retryTx.id).toBe(originalTx.id);
      expect(retryTx.type).toBe("credit"); // Original type preserved
      expect(retryTx.amount).toBe("30.00"); // Original amount preserved
      expect(retryTx.description).toBe("Original Payment"); // Original description preserved
      expect(retryTx.duplicate).toBe(true);

      // Balance must still be 30.00
      const balRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/balance`,
      });
      expect(JSON.parse(balRes.body).balance).toBe("30.00");
    });
  });
});
