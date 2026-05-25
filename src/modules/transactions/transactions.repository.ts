import { Injectable } from '@nestjs/common';
import {
  Account,
  Prisma,
  Transaction,
  TransactionType,
} from '../../generated/prisma/client';
import { DatabaseService } from '../../database/database.service';

export interface RecordTransactionInput {
  accountId: string;
  value: Prisma.Decimal;
  type: TransactionType;
  newBalance: Prisma.Decimal;
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly db: DatabaseService) {}

  async sumWithdrawalsInRange(
    tx: Prisma.TransactionClient,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Prisma.Decimal> {
    const result = await tx.transaction.aggregate({
      where: {
        accountId,
        type: 'WITHDRAWAL',
        transactionDate: { gte: from, lte: to },
      },
      _sum: { value: true },
    });
    return result._sum.value ?? new Prisma.Decimal(0);
  }

  async record(
    tx: Prisma.TransactionClient,
    input: RecordTransactionInput,
  ): Promise<{ transaction: Transaction; account: Account }> {
    const account = await tx.account.update({
      where: { accountId: input.accountId },
      data: { balance: input.newBalance },
    });
    const transaction = await tx.transaction.create({
      data: {
        accountId: input.accountId,
        value: input.value,
        type: input.type,
      },
    });
    return { transaction, account };
  }

  findStatement(
    accountId: string,
    from?: Date,
    to?: Date,
  ): Promise<Transaction[]> {
    return this.db.transaction.findMany({
      where: {
        accountId,
        ...(from || to
          ? {
              transactionDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { transactionDate: 'asc' },
    });
  }
}
