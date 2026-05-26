import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account, Prisma } from '../../generated/prisma/client';
import { ACCOUNT_TYPE_NAME } from '../../common/constants';
import { toMoney } from '../../common/money';
import { DatabaseService } from '../../database/database.service';
import {
  CreateAccountDto,
  SearchAccountsDto,
  UpdateLimitDto,
} from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly db: DatabaseService) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    const existing = await this.db.account.findUnique({
      where: {
        personId_accountType: {
          personId: dto.personId,
          accountType: dto.accountType,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Person ${dto.personId} already has a ${ACCOUNT_TYPE_NAME[dto.accountType]} account`,
      );
    }

    return this.db.account.create({
      data: {
        personId: dto.personId,
        accountType: dto.accountType,
        dailyWithdrawalLimit: toMoney(dto.dailyWithdrawalLimit),
        balance: toMoney(dto.initialBalance ?? 0),
      },
    });
  }

  async getById(accountId: string): Promise<Account> {
    const account = await this.db.account.findUnique({ where: { accountId } });
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    return account;
  }

  async search(filters: SearchAccountsDto): Promise<Account[]> {
    const where: Prisma.AccountWhereInput = {
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...(filters.personId ? { personId: filters.personId } : {}),
      ...(filters.accountType !== undefined
        ? { accountType: filters.accountType }
        : {}),
      ...(filters.activeFlag !== undefined
        ? { activeFlag: filters.activeFlag }
        : {}),
    };

    const balance = this.toDecimalFilter(
      filters.balance,
      filters.minBalance,
      filters.maxBalance,
    );
    if (balance !== undefined) where.balance = balance;

    const limit = this.toDecimalFilter(
      filters.dailyWithdrawalLimit,
      filters.minDailyWithdrawalLimit,
      filters.maxDailyWithdrawalLimit,
    );
    if (limit !== undefined) where.dailyWithdrawalLimit = limit;

    return this.db.account.findMany({
      where,
      orderBy: { createDate: 'desc' },
    });
  }

  private toDecimalFilter(
    eq?: number,
    min?: number,
    max?: number,
  ): Prisma.AccountWhereInput['balance'] {
    if (eq !== undefined) return toMoney(eq);
    if (min === undefined && max === undefined) return undefined;
    return {
      ...(min !== undefined ? { gte: toMoney(min) } : {}),
      ...(max !== undefined ? { lte: toMoney(max) } : {}),
    };
  }

  async updateLimit(accountId: string, dto: UpdateLimitDto): Promise<Account> {
    await this.getById(accountId);
    return this.db.account.update({
      where: { accountId },
      data: { dailyWithdrawalLimit: toMoney(dto.dailyWithdrawalLimit) },
    });
  }

  async block(accountId: string): Promise<Account> {
    await this.getById(accountId);
    return this.db.account.update({
      where: { accountId },
      data: { activeFlag: false },
    });
  }

  async activate(accountId: string): Promise<Account> {
    await this.getById(accountId);
    return this.db.account.update({
      where: { accountId },
      data: { activeFlag: true },
    });
  }
}
