import fastify, { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import { randomUUID } from "node:crypto";
import databasePlugin from "./plugins/database.js";
import { healthRoutes } from "./routes/health.js";
import { accountRoutes } from "./routes/accounts.js";
import { transferRoutes } from "./routes/transfers.js";
import { AppError } from "./errors/app-error.js";

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = fastify({
    genReqId: () => `req_${randomUUID().replace(/-/g, "")}`,
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
          };
        },
      },
    },
    ...opts,
  });

  // Global Error Handler
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          request_id: request.id,
        },
      });
    }

    const fastifyErr = error as FastifyError;
    const statusCode =
      typeof fastifyErr.statusCode === "number" &&
      fastifyErr.statusCode >= 400 &&
      fastifyErr.statusCode < 600
        ? fastifyErr.statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error(error);
      return reply.status(statusCode).send({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred.",
          details: [],
          request_id: request.id,
        },
      });
    }

    return reply.status(statusCode).send({
      error: {
        code: fastifyErr.code || "VALIDATION_ERROR",
        message: fastifyErr.message || "Invalid request.",
        details: fastifyErr.validation || [],
        request_id: request.id,
      },
    });
  });

  // 404 Handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found.`,
        details: [],
        request_id: request.id,
      },
    });
  });

  // Plugins
  app.register(databasePlugin);

  // Health and Readiness Routes (registered at root and /api/v1)
  app.register(healthRoutes);
  app.register(healthRoutes, { prefix: "/api/v1" });

  // Phase 1-3: Accounts & Transactions Routes
  app.register(accountRoutes, { prefix: "/api/v1" });

  // Phase 5: Transfers Routes
  app.register(transferRoutes, { prefix: "/api/v1" });

  return app;
}
