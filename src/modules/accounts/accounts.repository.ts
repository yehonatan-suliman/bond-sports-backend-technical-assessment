import { Injectable } from '@nestjs/common';
import { Account, Prisma } from '../../generated/prisma/client';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AccountsRepository {
  constructor(private readonly db: DatabaseService) {}

  create(data: Prisma.AccountCreateInput): Promise<Account> {
    return this.db.account.create({ data });
  }

  findById(accountId: string): Promise<Account | null> {
    return this.db.account.findUnique({ where: { accountId } });
  }

  findByPersonId(personId: string): Promise<Account[]> {
    return this.db.account.findMany({
      where: { personId },
      orderBy: { createDate: 'desc' },
    });
  }

  findByPersonAndType(
    personId: string,
    accountType: number,
  ): Promise<Account | null> {
    return this.db.account.findUnique({
      where: { personId_accountType: { personId, accountType } },
    });
  }

  updateLimit(
    accountId: string,
    dailyWithdrawalLimit: Prisma.Decimal,
  ): Promise<Account> {
    return this.db.account.update({
      where: { accountId },
      data: { dailyWithdrawalLimit },
    });
  }

  setActiveFlag(accountId: string, activeFlag: boolean): Promise<Account> {
    return this.db.account.update({
      where: { accountId },
      data: { activeFlag },
    });
  }
}
