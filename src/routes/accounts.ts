import type { FastifyPluginAsync } from "fastify";
import { AccountRepository } from "../repositories/account-repository.js";
import { TransactionRepository } from "../repositories/transaction-repository.js";
import { AccountService } from "../services/account-service.js";
import { LedgerService } from "../services/ledger-service.js";
import {
  createAccountSchema,
  accountIdParamSchema,
  validateSchema,
} from "../schemas/account.js";
import { createTransactionSchema } from "../schemas/transaction.js";
import { listTransactionsQuerySchema } from "../schemas/pagination.js";
import { decimalStringToMinor } from "../utils/money.js";

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  const accountRepository = new AccountRepository(fastify.prisma);
  const transactionRepository = new TransactionRepository(fastify.prisma);
  const accountService = new AccountService(accountRepository);
  const ledgerService = new LedgerService(
    fastify.prisma,
    accountRepository,
    transactionRepository
  );

  // POST /accounts
  fastify.post("/accounts", async (request, reply) => {
    const validatedData = validateSchema(createAccountSchema, request.body);
    const result = await accountService.createAccount(validatedData.name);
    return reply.status(201).send(result);
  });

  // GET /accounts/:accountId/balance
  fastify.get("/accounts/:accountId/balance", async (request, reply) => {
    const validatedParams = validateSchema(
      accountIdParamSchema,
      request.params
    );
    const result = await accountService.getAccountBalance(
      validatedParams.accountId
    );
    return reply.status(200).send(result);
  });

  // POST /accounts/:accountId/transactions
  fastify.post("/accounts/:accountId/transactions", async (request, reply) => {
    const validatedParams = validateSchema(
      accountIdParamSchema,
      request.params
    );
    const validatedBody = validateSchema(
      createTransactionSchema,
      request.body
    );
    const amountMinor = decimalStringToMinor(validatedBody.amount);

    const result = await ledgerService.createTransaction({
      accountId: validatedParams.accountId,
      type: validatedBody.type,
      amountMinor,
      description: validatedBody.description,
      referenceId: validatedBody.reference_id,
    });

    const statusCode = result.duplicate ? 200 : 201;
    return reply.status(statusCode).send(result);
  });

  // GET /accounts/:accountId/transactions
  fastify.get("/accounts/:accountId/transactions", async (request, reply) => {
    const validatedParams = validateSchema(
      accountIdParamSchema,
      request.params
    );
    const validatedQuery = validateSchema(
      listTransactionsQuerySchema,
      request.query
    );

    const result = await ledgerService.listTransactions({
      accountId: validatedParams.accountId,
      type: validatedQuery.type,
      page: validatedQuery.page,
      limit: validatedQuery.limit,
    });

    return reply.status(200).send(result);
  });
};
