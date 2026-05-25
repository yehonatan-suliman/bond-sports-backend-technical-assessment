import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Account } from '../../../generated/prisma/client';
import { ACCOUNT_TYPE_VALUES } from '../../../common/constants';
import type { AccountTypeValue } from '../../../common/constants';
import { moneyToString, toMoney } from '../../../common/money';

export const createAccountSchema = z
  .object({
    personId: z.string().uuid({ message: 'personId must be a valid UUID' }),
    accountType: z
      .number()
      .int()
      .refine(
        (value): value is (typeof ACCOUNT_TYPE_VALUES)[number] =>
          (ACCOUNT_TYPE_VALUES as readonly number[]).includes(value),
        { message: 'accountType must be 1 (CHECKING) or 2 (SAVINGS)' },
      ),
    dailyWithdrawalLimit: z.number().positive().multipleOf(0.01),
    initialBalance: z.number().nonnegative().multipleOf(0.01).optional(),
  })
  .strict();

export class CreateAccountDto extends createZodDto(createAccountSchema) {}

export const updateLimitSchema = z
  .object({
    dailyWithdrawalLimit: z.number().positive().multipleOf(0.01),
  })
  .strict();

export class UpdateLimitDto extends createZodDto(updateLimitSchema) {}

export const accountResponseSchema = z.object({
  accountId: z.string().uuid(),
  personId: z.string().uuid(),
  balance: z.string(),
  dailyWithdrawalLimit: z.string(),
  activeFlag: z.boolean(),
  accountType: z.number().int(),
  createDate: z.iso.datetime(),
});

export class AccountResponseDto extends createZodDto(accountResponseSchema) {
  static from(account: Account): AccountResponseDto {
    return {
      accountId: account.accountId,
      personId: account.personId,
      balance: moneyToString(toMoney(account.balance.toString())),
      dailyWithdrawalLimit: moneyToString(toMoney(account.dailyWithdrawalLimit.toString())),
      activeFlag: account.activeFlag,
      accountType: account.accountType as AccountTypeValue,
      createDate: account.createDate.toISOString(),
    };
  }
}
