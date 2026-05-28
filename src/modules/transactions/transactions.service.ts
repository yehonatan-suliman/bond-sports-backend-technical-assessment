import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { Prisma, TransactionType } from '../../generated/prisma/client';
import { ACCOUNT_TYPE } from '../../models/accountType.model';
import { DatabaseService } from '../../database/database.service';
import { moneyToString, toDecimalFilter } from '../../util/calc.util';
import {
  CreateTransactionDto,
  SearchTransactionsDto,
  StatementQueryDto,
  TransactionResponseDto,
} from './dto/transaction.dto';

const STATEMENT_DEFAULT_WINDOW_DAYS = 30;

interface LockedAccount {
  account_id: string;
  balance: Prisma.Decimal;
  daily_withdrawal_limit: Prisma.Decimal;
  active_flag: boolean;
  account_type: number;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly db: DatabaseService) {}

  deposit(accountId: string, dto: CreateTransactionDto) {
    return this.processTransaction(accountId, dto, 'DEPOSIT');
  }

  withdraw(accountId: string, dto: CreateTransactionDto) {
    return this.processTransaction(accountId, dto, 'WITHDRAWAL');
  }

  async search(filters: SearchTransactionsDto) {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;

    const value = toDecimalFilter(
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

    return this.db.transaction.findMany({
      where,
      orderBy: { transactionDate: 'asc' },
    });
  }

  async getStatement(accountId: string, query: StatementQueryDto) {
    const account = await this.db.account.findUnique({ where: { accountId } });
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : this.daysBefore(to, STATEMENT_DEFAULT_WINDOW_DAYS);

    const [periodGroups, listed] = await Promise.all([
      this.db.transaction.groupBy({
        by: ['type'],
        where: { accountId, transactionDate: { gte: from, lte: to } },
        _sum: { value: true },
      }),
      this.db.transaction.findMany({
        where: {
          accountId,
          transactionDate: { gte: from, lte: to },
          ...(query.type ? { type: query.type } : {}),
        },
        orderBy: { transactionDate: 'asc' },
      }),
    ]);

    const period = this.sumByType(periodGroups);

    return {
      accountId,
      from: from.toISOString(),
      to: to.toISOString(),
      transactions: listed.map(TransactionResponseDto.from),
      totalDeposits: moneyToString(period.DEPOSIT),
      totalWithdrawals: moneyToString(period.WITHDRAWAL),
    };
  }

  private sumByType(
    groups: {
      type: TransactionType;
      _sum: { value: Prisma.Decimal | null };
    }[],
  ): Record<TransactionType, Prisma.Decimal> {
    const map: Record<TransactionType, Prisma.Decimal> = {
      DEPOSIT: new Prisma.Decimal(0),
      WITHDRAWAL: new Prisma.Decimal(0),
    };
    groups.forEach((g) => {
      if (g._sum.value) map[g.type] = g._sum.value;
    });
    return map;
  }

  private daysBefore(reference: Date, days: number): Date {
    const result = new Date(reference);
    result.setUTCDate(result.getUTCDate() - days);
    return result;
  }

  private async processTransaction(
    accountId: string,
    dto: CreateTransactionDto,
    type: TransactionType,
  ) {
    const value = this.normalizeValue(dto.value);

    return this.db.$transaction(
      async (dbClient) => {
        const account = await this.lockAccount(dbClient, accountId);
        this.accountActiveCheck(account);

        if (type === 'WITHDRAWAL') {
          await this.withdrawalAllowedCheck(dbClient, account, value);
        }

        const currentBalance = account.balance;
        return this.applyTransaction(
          dbClient,
          accountId,
          currentBalance,
          value,
          type,
        );
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private normalizeValue(value: Decimal): Decimal {
    if (value.lte(0)) {
      throw new BadRequestException(
        'Transaction value must be greater than zero',
      );
    }
    return value;
  }

  private async lockAccount(
    dbClient: Prisma.TransactionClient,
    accountId: string,
  ) {
    const [account] = await dbClient.$queryRaw<LockedAccount[]>(Prisma.sql`
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
    return account;
  }

  private accountActiveCheck(account: LockedAccount) {
    if (!account.active_flag) {
      throw new ForbiddenException('Account is blocked');
    }
  }

  private async withdrawalAllowedCheck(
    dbClient: Prisma.TransactionClient,
    account: LockedAccount,
    value: Decimal,
  ): Promise<void> {
    const {
      daily_withdrawal_limit: limit,
      account_type: type,
      balance,
      account_id: accountId,
    } = account;
    await this.withinDailyLimitCheck(dbClient, accountId, value, limit);
    this.notSavingsOverdraftCheck(type, balance, value);
  }

  private async sumTodayWithdrawal(
    dbClient: Prisma.TransactionClient,
    accountId: string,
  ) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);
    const sumResult = await dbClient.transaction.aggregate({
      where: {
        accountId,
        type: 'WITHDRAWAL',
        transactionDate: { gte: startOfDay, lte: endOfDay },
      },
      _sum: { value: true },
    });
    return sumResult._sum.value ?? new Prisma.Decimal(0);
  }

  private async withinDailyLimitCheck(
    dbClient: Prisma.TransactionClient,
    accountId: string,
    value: Decimal,
    limit: Decimal,
  ) {
    const totalDailyWithdrawal = await this.sumTodayWithdrawal(
      dbClient,
      accountId,
    );
    const projectedTotal = totalDailyWithdrawal.plus(value);
    if (projectedTotal.gt(limit)) {
      throw new UnprocessableEntityException('Daily withdrawal limit exceeded');
    }
  }

  private notSavingsOverdraftCheck(
    type: number,
    currentBalance: Decimal,
    value: Decimal,
  ) {
    if (type === ACCOUNT_TYPE.SAVINGS && currentBalance.lt(value)) {
      throw new UnprocessableEntityException(
        'Savings account balance cannot go negative',
      );
    }
  }

  private async applyTransaction(
    dbClient: Prisma.TransactionClient,
    accountId: string,
    currentBalance: Decimal,
    value: Decimal,
    type: TransactionType,
  ) {
    const newBalance =
      type === 'DEPOSIT'
        ? currentBalance.plus(value)
        : currentBalance.minus(value);

    await dbClient.account.update({
      where: { accountId },
      data: { balance: new Prisma.Decimal(newBalance) },
    });
    return dbClient.transaction.create({ data: { accountId, value, type } });
  }
}
