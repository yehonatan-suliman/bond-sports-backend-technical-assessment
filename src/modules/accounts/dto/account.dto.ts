import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Account } from '../../../generated/prisma/client';
import {
  ACCOUNT_TYPE,
  ACCOUNT_TYPE_NAME,
} from '../../../models/accountType.model';
import type { AccountTypeValue } from '../../../models/accountType.model';
import { moneyToString, toMoney } from '../../../util/calc.util';
import {
  MoneySchema,
  nonNegativeMoneyQuerySchema,
  positiveMoneySchema,
} from 'src/models/money.model';

export const personIdSchema = z
  .string()
  .regex(/^\d{1,20}$/, { error: 'personId must be 1-20 digits' });

export const accountTypeNameSchema = z.enum(['CHECKING', 'SAVINGS']);

export const accountTypeInputSchema = z
  .union([accountTypeNameSchema, z.literal([1, 2])], {
    error: "accountType must be 'CHECKING'/'SAVINGS' or 1/2",
  })
  .transform(
    (value): AccountTypeValue =>
      typeof value === 'string' ? ACCOUNT_TYPE[value] : value,
  );

export const createAccountSchema = z
  .object({
    personId: personIdSchema,
    accountType: accountTypeInputSchema,
    dailyWithdrawalLimit: positiveMoneySchema.default(toMoney(500)),
  })
  .strict();

export class CreateAccountDto extends createZodDto(createAccountSchema) {}

export const updateLimitSchema = z
  .object({
    dailyWithdrawalLimit: positiveMoneySchema,
  })
  .strict();

export class UpdateLimitDto extends createZodDto(updateLimitSchema) {}

const accountTypeQuerySchema = z
  .union([
    accountTypeNameSchema,
    z.enum(['1', '2']).transform((s) => Number(s) as 1 | 2),
  ])
  .transform(
    (value): AccountTypeValue =>
      typeof value === 'string' ? ACCOUNT_TYPE[value] : value,
  );

const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const searchAccountsSchema = z
  .object({
    personId: personIdSchema.optional(),
    accountType: accountTypeQuerySchema.optional(),
    activeFlag: booleanQuerySchema.optional(),
    balance: MoneySchema.optional(),
    minBalance: MoneySchema.optional(),
    maxBalance: MoneySchema.optional(),
    dailyWithdrawalLimit: nonNegativeMoneyQuerySchema.optional(),
    minDailyWithdrawalLimit: nonNegativeMoneyQuerySchema.optional(),
    maxDailyWithdrawalLimit: nonNegativeMoneyQuerySchema.optional(),
  })
  .strict();

export class SearchAccountsDto extends createZodDto(searchAccountsSchema) {}

export const accountResponseSchema = z.object({
  accountId: z.uuid(),
  personId: personIdSchema,
  balance: z.string(),
  dailyWithdrawalLimit: z.string(),
  activeFlag: z.boolean(),
  accountType: accountTypeNameSchema,
  createDate: z.iso.datetime(),
});

export class AccountResponseDto extends createZodDto(accountResponseSchema) {
  static from(account: Account): AccountResponseDto {
    return {
      accountId: account.accountId,
      personId: account.personId,
      balance: moneyToString(toMoney(account.balance.toString())),
      dailyWithdrawalLimit: moneyToString(
        toMoney(account.dailyWithdrawalLimit.toString()),
      ),
      activeFlag: account.activeFlag,
      accountType: ACCOUNT_TYPE_NAME[account.accountType as AccountTypeValue],
      createDate: account.createDate.toISOString(),
    };
  }
}
