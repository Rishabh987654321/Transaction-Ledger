import { Prisma, PrismaClient, Transaction } from "@prisma/client";
import { AccountRepository } from "../repositories/account-repository.js";
import { TransactionRepository } from "../repositories/transaction-repository.js";
import {
  AccountNotFoundError,
  InsufficientFundsError,
  ValidationError,
} from "../errors/app-error.js";
import { minorToDecimalString } from "../utils/money.js";

const MAX_BIGINT_64 = 9223372036854775807n;

export interface CreateTransactionCommand {
  accountId: string;
  type: "credit" | "debit";
  amountMinor: bigint;
  description: string;
  referenceId: string;
}

export interface TransactionResponse {
  id: string;
  account_id: string;
  type: "credit" | "debit";
  amount: string;
  description: string;
  reference_id: string;
  created_at: string;
  duplicate: boolean;
}

export interface ListTransactionsParams {
  accountId: string;
  type?: "credit" | "debit";
  page: number;
  limit: number;
}

export interface TransactionHistoryItem {
  id: string;
  account_id: string;
  type: "credit" | "debit";
  amount: string;
  description: string;
  reference_id: string;
  created_at: string;
}

export interface PaginatedTransactionsResponse {
  data: TransactionHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class LedgerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly accountRepository: AccountRepository,
    private readonly transactionRepository: TransactionRepository
  ) {}

  async createTransaction(
    command: CreateTransactionCommand
  ): Promise<TransactionResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Lock the account row
        const lockedAccount =
          await this.accountRepository.lockAccountForUpdate(
            tx,
            command.accountId
          );

        // 2. Account existence check
        if (!lockedAccount) {
          throw new AccountNotFoundError();
        }

        // 3. Idempotency check while holding the lock
        const existingTx =
          await this.transactionRepository.findByAccountAndReference(
            tx,
            command.accountId,
            command.referenceId
          );

        if (existingTx) {
          return this.formatTransactionResponse(existingTx, true);
        }

        // 4. Debit balance sufficiency check
        if (
          command.type === "debit" &&
          lockedAccount.balanceMinor < command.amountMinor
        ) {
          throw new InsufficientFundsError(
            "Insufficient funds for debit operation."
          );
        }

        // 5. Calculate new balance
        const newBalance =
          command.type === "credit"
            ? lockedAccount.balanceMinor + command.amountMinor
            : lockedAccount.balanceMinor - command.amountMinor;

        if (newBalance > MAX_BIGINT_64) {
          throw new ValidationError(
            "Balance exceeds maximum allowable limit.",
            [{ field: "amount", message: "Balance would exceed maximum limit" }]
          );
        }

        // 6. Insert immutable transaction row
        const createdTx = await this.transactionRepository.create(tx, {
          accountId: command.accountId,
          type: command.type,
          amountMinor: command.amountMinor,
          description: command.description,
          referenceId: command.referenceId,
        });

        // 7. Update cached balance on account row
        await this.accountRepository.updateBalance(
          tx,
          command.accountId,
          newBalance
        );

        // 8. Return created transaction with duplicate: false
        return this.formatTransactionResponse(createdTx, false);
      });
    } catch (error) {
      // Final defense: if a race condition hit the unique constraint
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const fallbackTx =
          await this.prisma.transaction.findUnique({
            where: {
              accountId_referenceId: {
                accountId: command.accountId,
                referenceId: command.referenceId,
              },
            },
          });

        if (fallbackTx) {
          return this.formatTransactionResponse(fallbackTx, true);
        }
      }

      throw error;
    }
  }

  async listTransactions(
    params: ListTransactionsParams
  ): Promise<PaginatedTransactionsResponse> {
    // 1. Verify account exists
    const account = await this.accountRepository.findById(params.accountId);
    if (!account) {
      throw new AccountNotFoundError();
    }

    // 2. Query transactions and total count
    const { data, total } =
      await this.transactionRepository.findManyByAccount(params.accountId, {
        type: params.type,
        page: params.page,
        limit: params.limit,
      });

    // 3. Compute totalPages
    const totalPages = params.limit > 0 ? Math.ceil(total / params.limit) : 0;

    // 4. Format transaction items
    const formattedData: TransactionHistoryItem[] = data.map((tx) => ({
      id: tx.id,
      account_id: tx.accountId,
      type: tx.type as "credit" | "debit",
      amount: minorToDecimalString(tx.amountMinor),
      description: tx.description,
      reference_id: tx.referenceId,
      created_at: tx.createdAt.toISOString(),
    }));

    return {
      data: formattedData,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages,
      },
    };
  }

  private formatTransactionResponse(
    tx: Transaction,
    duplicate: boolean
  ): TransactionResponse {
    return {
      id: tx.id,
      account_id: tx.accountId,
      type: tx.type as "credit" | "debit",
      amount: minorToDecimalString(tx.amountMinor),
      description: tx.description,
      reference_id: tx.referenceId,
      created_at: tx.createdAt.toISOString(),
      duplicate,
    };
  }
}
