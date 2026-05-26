import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account } from '../../generated/prisma/client';
import { ACCOUNT_TYPE_NAME } from '../../common/constants';
import { toMoney } from '../../common/money';
import { DatabaseService } from '../../database/database.service';
import { CreateAccountDto, UpdateLimitDto } from './dto/account.dto';

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

  async listByPerson(personId: string): Promise<Account[]> {
    return this.db.account.findMany({
      where: { personId },
      orderBy: { createDate: 'desc' },
    });
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
