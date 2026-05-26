import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Transaction } from '../../../generated/prisma/client';
import { moneyToString, toMoney } from '../../../common/money';

export const createTransactionSchema = z
  .object({
    value: z.number().positive().multipleOf(0.01),
  })
  .strict();

export class CreateTransactionDto extends createZodDto(createTransactionSchema) {}

export const statementQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict();

export class StatementQueryDto extends createZodDto(statementQuerySchema) {}

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
  accountId: z.uuid(),
  from: z.iso.datetime().nullable(),
  to: z.iso.datetime().nullable(),
  transactions: z.array(transactionResponseSchema),
  totalDeposits: z.string(),
  totalWithdrawals: z.string(),
  netAmount: z.string(),
});

export class StatementResponseDto extends createZodDto(statementResponseSchema) {}
