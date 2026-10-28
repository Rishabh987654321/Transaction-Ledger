import { Prisma, PrismaClient, Transaction } from "@prisma/client";

export class TransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByAccountAndReference(
    tx: Prisma.TransactionClient,
    accountId: string,
    referenceId: string
  ): Promise<Transaction | null> {
    return tx.transaction.findUnique({
      where: {
        accountId_referenceId: {
          accountId,
          referenceId,
        },
      },
    });
  }

  async create(
    tx: Prisma.TransactionClient,
    data: {
      accountId: string;
      type: string;
      amountMinor: bigint;
      description: string;
      referenceId: string;
    }
  ): Promise<Transaction> {
    return tx.transaction.create({
      data: {
        accountId: data.accountId,
        type: data.type,
        amountMinor: data.amountMinor,
        description: data.description,
        referenceId: data.referenceId,
      },
    });
  }

  async findManyByAccount(
    accountId: string,
    options: {
      type?: "credit" | "debit";
      page: number;
      limit: number;
    }
  ): Promise<{ data: Transaction[]; total: number }> {
    const where: Prisma.TransactionWhereInput = {
      accountId,
      ...(options.type ? { type: options.type } : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    return { data, total };
  }
}
