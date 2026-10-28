import type { FastifyPluginAsync } from "fastify";
import { AccountRepository } from "../repositories/account-repository.js";
import { TransferRepository } from "../repositories/transfer-repository.js";
import { TransferService } from "../services/transfer-service.js";
import { createTransferSchema } from "../schemas/transfer.js";
import { validateSchema } from "../schemas/account.js";
import { decimalStringToMinor } from "../utils/money.js";

export const transferRoutes: FastifyPluginAsync = async (fastify) => {
  const accountRepository = new AccountRepository(fastify.prisma);
  const transferRepository = new TransferRepository(fastify.prisma);
  const transferService = new TransferService(
    fastify.prisma,
    accountRepository,
    transferRepository
  );

  // POST /transfers
  fastify.post("/transfers", async (request, reply) => {
    const validatedBody = validateSchema(createTransferSchema, request.body);
    const amountMinor = decimalStringToMinor(validatedBody.amount);

    const result = await transferService.createTransfer({
      sourceAccountId: validatedBody.source_account_id,
      destinationAccountId: validatedBody.destination_account_id,
      amountMinor,
      description: validatedBody.description,
      referenceId: validatedBody.reference_id,
    });

    const statusCode = result.duplicate ? 200 : 201;
    return reply.status(statusCode).send(result);
  });
};
