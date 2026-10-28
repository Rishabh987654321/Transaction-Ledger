import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

describe("Transaction History API Integration Tests (GET /accounts/:accountId/transactions)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns empty list with accurate pagination for an account with no transactions", async () => {
    const accRes = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      payload: { name: "Zero Tx Account" },
    });
    const account = JSON.parse(accRes.body);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/transactions`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it("returns transactions ordered latest-first (created_at DESC, id DESC)", async () => {
    const accRes = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      payload: { name: "Ordering Test Account" },
    });
    const account = JSON.parse(accRes.body);

    // Create 3 transactions in sequence
    const tx1 = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/transactions`,
      payload: {
        type: "credit",
        amount: "10.00",
        description: "First Tx",
        reference_id: "order-1",
      },
    });
    const tx2 = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/transactions`,
      payload: {
        type: "credit",
        amount: "20.00",
        description: "Second Tx",
        reference_id: "order-2",
      },
    });
    const tx3 = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/transactions`,
      payload: {
        type: "debit",
        amount: "5.00",
        description: "Third Tx",
        reference_id: "order-3",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/transactions`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(3);

    // Latest first: tx3, tx2, tx1
    expect(body.data[0].id).toBe(JSON.parse(tx3.body).id);
    expect(body.data[0].description).toBe("Third Tx");
    expect(body.data[1].id).toBe(JSON.parse(tx2.body).id);
    expect(body.data[1].description).toBe("Second Tx");
    expect(body.data[2].id).toBe(JSON.parse(tx1.body).id);
    expect(body.data[2].description).toBe("First Tx");

    // History items must NOT contain duplicate flag
    expect(body.data[0].duplicate).toBeUndefined();
  });

  it("filters transactions by type (credit and debit)", async () => {
    const accRes = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      payload: { name: "Filter Test Account" },
    });
    const account = JSON.parse(accRes.body);

    // 2 credits, 1 debit
    await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/transactions`,
      payload: {
        type: "credit",
        amount: "50.00",
        description: "Credit 1",
        reference_id: "filter-c1",
      },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/transactions`,
      payload: {
        type: "credit",
        amount: "30.00",
        description: "Credit 2",
        reference_id: "filter-c2",
      },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/transactions`,
      payload: {
        type: "debit",
        amount: "15.00",
        description: "Debit 1",
        reference_id: "filter-d1",
      },
    });

    // Filter credit
    const creditRes = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/transactions?type=credit`,
    });
    expect(creditRes.statusCode).toBe(200);
    const creditBody = JSON.parse(creditRes.body);
    expect(creditBody.data.length).toBe(2);
    expect(creditBody.data.every((t: any) => t.type === "credit")).toBe(true);
    expect(creditBody.pagination.total).toBe(2);

    // Filter debit
    const debitRes = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/transactions?type=debit`,
    });
    expect(debitRes.statusCode).toBe(200);
    const debitBody = JSON.parse(debitRes.body);
    expect(debitBody.data.length).toBe(1);
    expect(debitBody.data[0].type).toBe("debit");
    expect(debitBody.pagination.total).toBe(1);
  });

  it("handles pagination with limit, page offsets, and pages beyond total", async () => {
    const accRes = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      payload: { name: "Pagination Test Account" },
    });
    const account = JSON.parse(accRes.body);

    // Create 5 transactions
    for (let i = 1; i <= 5; i++) {
      await app.inject({
        method: "POST",
        url: `/api/v1/accounts/${account.id}/transactions`,
        payload: {
          type: "credit",
          amount: `${i * 10}.00`,
          description: `Page item ${i}`,
          reference_id: `page-ref-${i}`,
        },
      });
    }

    // Page 1, limit 2 -> items 5 and 4
    const page1Res = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/transactions?page=1&limit=2`,
    });
    const page1 = JSON.parse(page1Res.body);
    expect(page1.data.length).toBe(2);
    expect(page1.data[0].description).toBe("Page item 5");
    expect(page1.data[1].description).toBe("Page item 4");
    expect(page1.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });

    // Page 2, limit 2 -> items 3 and 2
    const page2Res = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/transactions?page=2&limit=2`,
    });
    const page2 = JSON.parse(page2Res.body);
    expect(page2.data.length).toBe(2);
    expect(page2.data[0].description).toBe("Page item 3");
    expect(page2.data[1].description).toBe("Page item 2");

    // Page 3, limit 2 -> item 1
    const page3Res = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/transactions?page=3&limit=2`,
    });
    const page3 = JSON.parse(page3Res.body);
    expect(page3.data.length).toBe(1);
    expect(page3.data[0].description).toBe("Page item 1");

    // Page 4 beyond total -> data: []
    const page4Res = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/transactions?page=4&limit=2`,
    });
    const page4 = JSON.parse(page4Res.body);
    expect(page4.data).toEqual([]);
    expect(page4.pagination).toEqual({
      page: 4,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
  });

  describe("Validation & Errors on History Endpoint", () => {
    it("returns 404 ACCOUNT_NOT_FOUND when account does not exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/accounts/00000000-0000-0000-0000-000000000000/transactions",
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("returns 400 when accountId is not a valid UUID", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/accounts/invalid-uuid/transactions",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid query parameters", async () => {
      const accRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: { name: "Query Val Account" },
      });
      const account = JSON.parse(accRes.body);

      // page < 1
      const p0 = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/transactions?page=0`,
      });
      expect(p0.statusCode).toBe(400);

      // page non-integer
      const pFloat = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/transactions?page=1.5`,
      });
      expect(pFloat.statusCode).toBe(400);

      // limit > 100
      const l101 = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/transactions?limit=101`,
      });
      expect(l101.statusCode).toBe(400);

      // limit < 1
      const l0 = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/transactions?limit=0`,
      });
      expect(l0.statusCode).toBe(400);

      // invalid type
      const badType = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/transactions?type=invalid`,
      });
      expect(badType.statusCode).toBe(400);

      // unknown query param
      const unknownParam = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${account.id}/transactions?unknown_param=123`,
      });
      expect(unknownParam.statusCode).toBe(400);
    });
  });
});
