import { Prisma, PrismaClient, Transfer, Transaction } from "@prisma/client";
import { AccountRepository } from "../repositories/account-repository.js";
import { TransferRepository } from "../repositories/transfer-repository.js";
import {
  AccountNotFoundError,
  InsufficientFundsError,
  ValidationError,
} from "../errors/app-error.js";
import { minorToDecimalString } from "../utils/money.js";

const MAX_BIGINT_64 = 9223372036854775807n;

export interface CreateTransferCommand {
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: bigint;
  description: string;
  referenceId: string;
}

export interface TransferLedgerEntry {
  id: string;
  account_id: string;
  type: "credit" | "debit";
  amount: string;
  description: string;
  reference_id: string;
  created_at: string;
}

export interface TransferResponse {
  id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: string;
  description: string;
  reference_id: string;
  created_at: string;
  entries: TransferLedgerEntry[];
  duplicate: boolean;
}

export class TransferService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly accountRepository: AccountRepository,
    private readonly transferRepository: TransferRepository
  ) {}

  async createTransfer(
    command: CreateTransferCommand
  ): Promise<TransferResponse> {
    if (command.sourceAccountId === command.destinationAccountId) {
      throw new ValidationError(
        "source_account_id and destination_account_id must be distinct",
        [
          {
            field: "destination_account_id",
            message:
              "source_account_id and destination_account_id must be distinct",
          },
        ]
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Deadlock prevention: sort account IDs in ascending order and lock sequentially
        const [firstId, secondId] = [
          command.sourceAccountId,
          command.destinationAccountId,
        ].sort();

        const firstLocked =
          await this.accountRepository.lockAccountForUpdate(tx, firstId);
        const secondLocked =
          await this.accountRepository.lockAccountForUpdate(tx, secondId);

        // 2. Verify existence of both accounts
        if (!firstLocked || !secondLocked) {
          throw new AccountNotFoundError(
            "Source or destination account was not found."
          );
        }

        const sourceLocked =
          firstLocked.id === command.sourceAccountId
            ? firstLocked
            : secondLocked;
        const destLocked =
          firstLocked.id === command.destinationAccountId
            ? firstLocked
            : secondLocked;

        // 3. Transfer idempotency check while locks are held
        const existingTransfer =
          await this.transferRepository.findBySourceAndReference(
            tx,
            command.sourceAccountId,
            command.referenceId
          );

        if (existingTransfer) {
          return this.formatTransferResponse(
            existingTransfer,
            existingTransfer.transactions,
            true
          );
        }

        // 4. Source funds check
        if (sourceLocked.balanceMinor < command.amountMinor) {
          throw new InsufficientFundsError(
            "Insufficient funds for transfer operation."
          );
        }

        // 5. Destination balance overflow protection
        const newDestBalance = destLocked.balanceMinor + command.amountMinor;
        if (newDestBalance > MAX_BIGINT_64) {
          throw new ValidationError(
            "Destination balance exceeds maximum allowable limit.",
            [
              {
                field: "amount",
                message: "Destination balance would exceed maximum limit",
              },
            ]
          );
        }

        // 6. Create durable transfer record
        const transfer = await this.transferRepository.create(tx, {
          sourceAccountId: command.sourceAccountId,
          destinationAccountId: command.destinationAccountId,
          amountMinor: command.amountMinor,
          description: command.description,
          referenceId: command.referenceId,
        });

        // 7. Insert paired immutable ledger entries linked to transfer_id
        const debitTx = await tx.transaction.create({
          data: {
            accountId: command.sourceAccountId,
            type: "debit",
            amountMinor: command.amountMinor,
            description: command.description,
            referenceId: `transfer:${transfer.id}:debit`,
            transferId: transfer.id,
          },
        });

        const creditTx = await tx.transaction.create({
          data: {
            accountId: command.destinationAccountId,
            type: "credit",
            amountMinor: command.amountMinor,
            description: command.description,
            referenceId: `transfer:${transfer.id}:credit`,
            transferId: transfer.id,
          },
        });

        // 8. Update account balance projections
        await this.accountRepository.updateBalance(
          tx,
          command.sourceAccountId,
          sourceLocked.balanceMinor - command.amountMinor
        );
        await this.accountRepository.updateBalance(
          tx,
          command.destinationAccountId,
          newDestBalance
        );

        // 9. Return transfer response
        return this.formatTransferResponse(
          transfer,
          [debitTx, creditTx],
          false
        );
      });
    } catch (error) {
      // Race fallback on unique transfer constraint
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const fallback =
          await this.prisma.transfer.findUnique({
            where: {
              sourceAccountId_referenceId: {
                sourceAccountId: command.sourceAccountId,
                referenceId: command.referenceId,
              },
            },
            include: {
              transactions: {
                orderBy: [{ type: "asc" }, { id: "asc" }],
              },
            },
          });

        if (fallback) {
          return this.formatTransferResponse(
            fallback,
            fallback.transactions,
            true
          );
        }
      }

      throw error;
    }
  }

  private formatTransferResponse(
    transfer: Transfer,
    entries: Transaction[],
    duplicate: boolean
  ): TransferResponse {
    return {
      id: transfer.id,
      source_account_id: transfer.sourceAccountId,
      destination_account_id: transfer.destinationAccountId,
      amount: minorToDecimalString(transfer.amountMinor),
      description: transfer.description,
      reference_id: transfer.referenceId,
      created_at: transfer.createdAt.toISOString(),
      entries: entries.map((entry) => ({
        id: entry.id,
        account_id: entry.accountId,
        type: entry.type as "credit" | "debit",
        amount: minorToDecimalString(entry.amountMinor),
        description: entry.description,
        reference_id: entry.referenceId,
        created_at: entry.createdAt.toISOString(),
      })),
      duplicate,
    };
  }
}
