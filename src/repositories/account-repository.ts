import { Prisma, PrismaClient, Account } from "@prisma/client";

export interface LockedAccount {
  id: string;
  name: string;
  balanceMinor: bigint;
  createdAt: Date;
}

export class AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(name: string): Promise<Account> {
    return this.prisma.account.create({
      data: {
        name,
        balanceMinor: 0n,
      },
    });
  }

  async findById(id: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { id },
    });
  }

  async lockAccountForUpdate(
    tx: Prisma.TransactionClient,
    accountId: string
  ): Promise<LockedAccount | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        name: string;
        balance_minor: bigint;
        created_at: Date;
      }>
    >`SELECT id, name, balance_minor, created_at FROM "accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE`;

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      balanceMinor: row.balance_minor,
      createdAt: row.created_at,
    };
  }

  async updateBalance(
    tx: Prisma.TransactionClient,
    accountId: string,
    newBalanceMinor: bigint
  ): Promise<void> {
    await tx.account.update({
      where: { id: accountId },
      data: { balanceMinor: newBalanceMinor },
    });
  }
}
