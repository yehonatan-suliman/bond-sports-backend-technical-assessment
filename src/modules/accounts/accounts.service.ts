import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account } from '../../generated/prisma/client';
import { ACCOUNT_TYPE_NAME } from '../../common/constants';
import { toMoney } from '../../common/money';
import { AccountsRepository } from './accounts.repository';
import { CreateAccountDto, UpdateLimitDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly repository: AccountsRepository) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    const existing = await this.repository.findByPersonAndType(
      dto.personId,
      dto.accountType,
    );
    if (existing) {
      throw new ConflictException(
        `Person ${dto.personId} already has a ${ACCOUNT_TYPE_NAME[dto.accountType]} account`,
      );
    }

    return this.repository.create({
      personId: dto.personId,
      accountType: dto.accountType,
      dailyWithdrawalLimit: toMoney(dto.dailyWithdrawalLimit),
      balance: toMoney(dto.initialBalance ?? 0),
    });
  }

  async getById(accountId: string): Promise<Account> {
    const account = await this.repository.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    return account;
  }

  async listByPerson(personId: string): Promise<Account[]> {
    return this.repository.findByPersonId(personId);
  }

  async updateLimit(accountId: string, dto: UpdateLimitDto): Promise<Account> {
    await this.getById(accountId);
    return this.repository.updateLimit(accountId, toMoney(dto.dailyWithdrawalLimit));
  }

  async block(accountId: string): Promise<Account> {
    await this.getById(accountId);
    return this.repository.setActiveFlag(accountId, false);
  }

  async activate(accountId: string): Promise<Account> {
    await this.getById(accountId);
    return this.repository.setActiveFlag(accountId, true);
  }
}
