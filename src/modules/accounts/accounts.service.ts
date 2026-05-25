import { Injectable, NotFoundException } from '@nestjs/common';
import { Account } from '../../generated/prisma/client';
import { toMoney } from '../../common/money';
import { AccountsRepository } from './accounts.repository';
import { CreateAccountDto, UpdateLimitDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly repository: AccountsRepository) {}

  async create(dto: CreateAccountDto): Promise<Account> {
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
