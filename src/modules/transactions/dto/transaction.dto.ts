import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Transaction } from '../../../generated/prisma/client';
import {
  moneyToString,
  nonNegativeMoneyQuerySchema,
  positiveMoneySchema,
  toMoney,
} from '../../../util/moneyCalc.util';

export const createTransactionSchema = z
  .object({
    value: positiveMoneySchema,
  })
  .strict();

export class CreateTransactionDto extends createZodDto(
  createTransactionSchema,
) {}

export const searchTransactionsSchema = z
  .object({
    accountId: z.uuid().optional(),
    type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
    value: nonNegativeMoneyQuerySchema.optional(),
    minValue: nonNegativeMoneyQuerySchema.optional(),
    maxValue: nonNegativeMoneyQuerySchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict();

export class SearchTransactionsDto extends createZodDto(
  searchTransactionsSchema,
) {}

export const transactionResponseSchema = z.object({
  transactionId: z.uuid(),
  accountId: z.uuid(),
  value: z.string(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  transactionDate: z.iso.datetime(),
});

export class TransactionResponseDto extends createZodDto(
  transactionResponseSchema,
) {
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

export class StatementResponseDto extends createZodDto(
  statementResponseSchema,
) {}
