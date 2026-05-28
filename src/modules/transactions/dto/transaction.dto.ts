import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Transaction } from '../../../generated/prisma/client';
import { moneyToString, toMoney } from '../../../util/calc.util';
import {
  nonNegativeMoneyQuerySchema,
  positiveMoneySchema,
} from 'src/models/money.model';

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
  static from(transaction: Transaction): TransactionResponseDto {
    return {
      transactionId: transaction.transactionId,
      accountId: transaction.accountId,
      value: moneyToString(toMoney(transaction.value.toString())),
      type: transaction.type,
      transactionDate: transaction.transactionDate.toISOString(),
    };
  }
}

export const statementQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
  })
  .strict();

export class StatementQueryDto extends createZodDto(statementQuerySchema) {}
