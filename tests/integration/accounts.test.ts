import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

describe("Accounts API Integration Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/accounts", () => {
    it("creates an account with zero balance and returns 201", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: {
          name: "Aarav Sharma",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(body.name).toBe("Aarav Sharma");
      expect(body.balance).toBe("0.00");
      expect(new Date(body.created_at).toISOString()).toBe(body.created_at);
    });

    it("trims whitespace from name", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: {
          name: "   Priya Patel   ",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("Priya Patel");
    });

    it("rejects request when name is missing", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.request_id).toBeDefined();
    });

    it("rejects blank or empty name after trimming", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: {
          name: "     ",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects name longer than 120 characters", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: {
          name: "A".repeat(121),
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects forbidden extra fields (like balance, id, created_at)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: {
          name: "Rohan V",
          balance: "100.00",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.request_id).toBeDefined();
    });

    it("rejects malformed json or non-object body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        headers: { "content-type": "application/json" },
        payload: "{ invalid json",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBeDefined();
    });
  });

  describe("GET /api/v1/accounts/:accountId/balance", () => {
    it("returns 200 with zero balance for an existing account", async () => {
      // First create an account
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/accounts",
        payload: {
          name: "Vikram Malhotra",
        },
      });
      const created = JSON.parse(createRes.body);

      // Now query balance
      const balanceRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${created.id}/balance`,
      });

      expect(balanceRes.statusCode).toBe(200);
      const body = JSON.parse(balanceRes.body);
      expect(body.account_id).toBe(created.id);
      expect(body.balance).toBe("0.00");
    });

    it("returns 400 when accountId is not a valid UUID", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/accounts/not-a-uuid-123/balance",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 with ACCOUNT_NOT_FOUND when account does not exist", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${nonExistentId}/balance`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("ACCOUNT_NOT_FOUND");
      expect(body.error.message).toBe("Account was not found.");
      expect(body.error.request_id).toBeDefined();
    });
  });

  describe("Health & Readiness probes remain intact", () => {
    it("GET /health returns 200 ok", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: "ok" });
    });

    it("GET /ready returns 200 ready", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/ready",
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: "ready" });
    });
  });
});
