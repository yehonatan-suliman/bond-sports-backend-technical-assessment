import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Transaction } from '../../../generated/prisma/client';
import { MAX_MONEY } from '../../../common/constants';
import { moneyToString, toMoney } from '../../../common/money';

export const createTransactionSchema = z
  .object({
    value: z.number().positive().multipleOf(0.01).max(MAX_MONEY),
  })
  .strict();

export class CreateTransactionDto extends createZodDto(createTransactionSchema) {}

const moneyQuerySchema = z.coerce
  .number()
  .nonnegative()
  .multipleOf(0.01)
  .max(MAX_MONEY);

export const searchTransactionsSchema = z
  .object({
    accountId: z.uuid().optional(),
    type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
    value: moneyQuerySchema.optional(),
    minValue: moneyQuerySchema.optional(),
    maxValue: moneyQuerySchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict();

export class SearchTransactionsDto extends createZodDto(searchTransactionsSchema) {}

export const transactionResponseSchema = z.object({
  transactionId: z.uuid(),
  accountId: z.uuid(),
  value: z.string(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  transactionDate: z.iso.datetime(),
});

export class TransactionResponseDto extends createZodDto(transactionResponseSchema) {
  static from(tx: Transaction): TransactionResponseDto {
    return {
      transactionId: tx.transactionId,
      accountId: tx.accountId,
      value: moneyToString(toMoney(tx.value.toString())),
      type: tx.type,
      transactionDate: tx.transactionDate.toISOString(),
    };
  }
}

export const statementResponseSchema = z.object({
  accountId: z.uuid().nullable(),
  from: z.iso.datetime().nullable(),
  to: z.iso.datetime().nullable(),
  transactions: z.array(transactionResponseSchema),
  totalDeposits: z.string(),
  totalWithdrawals: z.string(),
  netAmount: z.string(),
});

export class StatementResponseDto extends createZodDto(statementResponseSchema) {}
