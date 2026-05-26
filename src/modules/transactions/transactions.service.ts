import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  Transaction,
  TransactionType,
} from '../../generated/prisma/client';
import { ACCOUNT_TYPE } from '../../common/constants';
import { DatabaseService } from '../../database/database.service';
import { moneyToString, toMoney } from '../../common/money';
import {
  CreateTransactionDto,
  SearchTransactionsDto,
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

  async search(filters: SearchTransactionsDto): Promise<StatementResponseDto> {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException(
        '`from` must be earlier than or equal to `to`',
      );
    }

    if (filters.accountId) {
      const account = await this.db.account.findUnique({
        where: { accountId: filters.accountId },
      });
      if (!account) {
        throw new NotFoundException(`Account ${filters.accountId} not found`);
      }
    }

    const value = this.toDecimalFilter(
      filters.value,
      filters.minValue,
      filters.maxValue,
    );

    const where: Prisma.TransactionWhereInput = {
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(from || to
        ? {
            transactionDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const transactions = await this.db.transaction.findMany({
      where,
      orderBy: { transactionDate: 'asc' },
    });

    const totals = transactions.reduce(
      (acc, tx) => {
        const v = toMoney(tx.value.toString());
        return tx.type === 'DEPOSIT'
          ? { deposits: acc.deposits.plus(v), withdrawals: acc.withdrawals }
          : {
              deposits: acc.deposits,
              withdrawals: acc.withdrawals.plus(v),
            };
      },
      { deposits: toMoney(0), withdrawals: toMoney(0) },
    );

    return {
      accountId: filters.accountId ?? null,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      transactions: transactions.map(TransactionResponseDto.from),
      totalDeposits: moneyToString(totals.deposits),
      totalWithdrawals: moneyToString(totals.withdrawals),
      netAmount: moneyToString(totals.deposits.minus(totals.withdrawals)),
    };
  }

  private toDecimalFilter(
    eq?: number,
    min?: number,
    max?: number,
  ): Prisma.TransactionWhereInput['value'] {
    if (eq !== undefined) return toMoney(eq);
    if (min === undefined && max === undefined) return undefined;
    return {
      ...(min !== undefined ? { gte: toMoney(min) } : {}),
      ...(max !== undefined ? { lte: toMoney(max) } : {}),
    };
  }

  private async process(
    accountId: string,
    dto: CreateTransactionDto,
    type: TransactionType,
  ): Promise<Transaction> {
    const value = toMoney(dto.value);
    if (value.lte(0)) {
      throw new BadRequestException(
        'Transaction value must be greater than zero',
      );
    }

    return this.db.$transaction(
      async (tx) => {
        const [account] = await tx.$queryRaw<
          Array<{
            account_id: string;
            balance: Prisma.Decimal;
            daily_withdrawal_limit: Prisma.Decimal;
            active_flag: boolean;
            account_type: number;
          }>
        >(Prisma.sql`
          SELECT "accountId" AS account_id,
                 "balance",
                 "dailyWithdrawalLimit" AS daily_withdrawal_limit,
                 "activeFlag" AS active_flag,
                 "accountType" AS account_type
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
          if (
            account.account_type === ACCOUNT_TYPE.SAVINGS &&
            currentBalance.lt(value)
          ) {
            throw new UnprocessableEntityException(
              'Savings account balance cannot go negative',
            );
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
          const alreadyWithdrawn =
            sumResult._sum.value ?? new Prisma.Decimal(0);
          const projectedTotal = toMoney(alreadyWithdrawn.toString()).plus(
            value,
          );
          if (projectedTotal.gt(limit)) {
            throw new UnprocessableEntityException(
              'Daily withdrawal limit exceeded',
            );
          }
        }

        const newBalance =
          type === 'DEPOSIT'
            ? currentBalance.plus(value)
            : currentBalance.minus(value);

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
