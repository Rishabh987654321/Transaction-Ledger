import { Prisma, PrismaClient, Transfer, Transaction } from "@prisma/client";

export class TransferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySourceAndReference(
    tx: Prisma.TransactionClient,
    sourceAccountId: string,
    referenceId: string
  ): Promise<(Transfer & { transactions: Transaction[] }) | null> {
    return tx.transfer.findUnique({
      where: {
        sourceAccountId_referenceId: {
          sourceAccountId,
          referenceId,
        },
      },
      include: {
        transactions: {
          orderBy: [{ type: "asc" }, { id: "asc" }],
        },
      },
    });
  }

  async create(
    tx: Prisma.TransactionClient,
    data: {
      sourceAccountId: string;
      destinationAccountId: string;
      amountMinor: bigint;
      description: string;
      referenceId: string;
    }
  ): Promise<Transfer> {
    return tx.transfer.create({
      data: {
        sourceAccountId: data.sourceAccountId,
        destinationAccountId: data.destinationAccountId,
        amountMinor: data.amountMinor,
        description: data.description,
        referenceId: data.referenceId,
      },
    });
  }
}
