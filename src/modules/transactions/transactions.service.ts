import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Transaction, TransactionType } from '../../generated/prisma/client';
import { DatabaseService } from '../../database/database.service';
import { moneyToString, toMoney } from '../../common/money';
import {
  CreateTransactionDto,
  StatementQueryDto,
  StatementResponseDto,
  TransactionResponseDto,
} from './dto/transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly db: DatabaseService) {}

  deposit(accountId: string, dto: CreateTransactionDto): Promise<Transaction> {
    return this.process(accountId, dto, 'DEPOSIT');
  }

  withdraw(accountId: string, dto: CreateTransactionDto): Promise<Transaction> {
    return this.process(accountId, dto, 'WITHDRAWAL');
  }

  async getStatement(
    accountId: string,
    query: StatementQueryDto,
  ): Promise<StatementResponseDto> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('`from` must be earlier than or equal to `to`');
    }

    const account = await this.db.account.findUnique({ where: { accountId } });
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    const transactions = await this.db.transaction.findMany({
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

    const totals = transactions.reduce(
      (acc, tx) => {
        const value = toMoney(tx.value.toString());
        return tx.type === 'DEPOSIT'
          ? { deposits: acc.deposits.plus(value), withdrawals: acc.withdrawals }
          : { deposits: acc.deposits, withdrawals: acc.withdrawals.plus(value) };
      },
      { deposits: toMoney(0), withdrawals: toMoney(0) },
    );

    return {
      accountId,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      transactions: transactions.map(TransactionResponseDto.from),
      totalDeposits: moneyToString(totals.deposits),
      totalWithdrawals: moneyToString(totals.withdrawals),
      netAmount: moneyToString(totals.deposits.minus(totals.withdrawals)),
    };
  }

  private async process(
    accountId: string,
    dto: CreateTransactionDto,
    type: TransactionType,
  ): Promise<Transaction> {
    const value = toMoney(dto.value);
    if (value.lte(0)) {
      throw new BadRequestException('Transaction value must be greater than zero');
    }

    return this.db.$transaction(
      async (tx) => {
        const [account] = await tx.$queryRaw<
          Array<{
            account_id: string;
            balance: Prisma.Decimal;
            daily_withdrawal_limit: Prisma.Decimal;
            active_flag: boolean;
          }>
        >(Prisma.sql`
          SELECT "accountId" AS account_id,
                 "balance",
                 "dailyWithdrawalLimit" AS daily_withdrawal_limit,
                 "activeFlag" AS active_flag
          FROM "accounts"
          WHERE "accountId" = ${accountId}::uuid
          FOR UPDATE
        `);

        if (!account) {
          throw new NotFoundException(`Account ${accountId} not found`);
        }
        if (!account.active_flag) {
          throw new ForbiddenException('Account is blocked');
        }

        const currentBalance = toMoney(account.balance.toString());
        const limit = toMoney(account.daily_withdrawal_limit.toString());

        if (type === 'WITHDRAWAL') {
          if (currentBalance.lt(value)) {
            throw new UnprocessableEntityException('Insufficient balance');
          }
          const startOfDay = new Date();
          startOfDay.setUTCHours(0, 0, 0, 0);
          const endOfDay = new Date();
          endOfDay.setUTCHours(23, 59, 59, 999);

          const sumResult = await tx.transaction.aggregate({
            where: {
              accountId,
              type: 'WITHDRAWAL',
              transactionDate: { gte: startOfDay, lte: endOfDay },
            },
            _sum: { value: true },
          });
          const alreadyWithdrawn = sumResult._sum.value ?? new Prisma.Decimal(0);
          const projectedTotal = toMoney(alreadyWithdrawn.toString()).plus(value);
          if (projectedTotal.gt(limit)) {
            throw new UnprocessableEntityException(
              'Daily withdrawal limit exceeded',
            );
          }
        }

        const newBalance =
          type === 'DEPOSIT' ? currentBalance.plus(value) : currentBalance.minus(value);

        await tx.account.update({
          where: { accountId },
          data: { balance: new Prisma.Decimal(newBalance.toString()) },
        });
        return tx.transaction.create({
          data: { accountId, value, type },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
