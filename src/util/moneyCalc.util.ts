import { Decimal } from 'decimal.js';
import { z } from 'zod';

const MAX_MONEY = 9999999999999.99;

const MONEY_DECIMAL_PLACES = 2;

export type MoneyInput = string | number | Decimal;

export const toMoney = (value: MoneyInput): Decimal =>
  new Decimal(value).toDecimalPlaces(
    MONEY_DECIMAL_PLACES,
    Decimal.ROUND_HALF_UP,
  );

export const moneyToString = (value: Decimal): string =>
  value.toFixed(MONEY_DECIMAL_PLACES);

export type DecimalRangeFilter = { gte?: Decimal; lte?: Decimal };

export function toDecimalFilter(
  eq?: Decimal,
  min?: Decimal,
  max?: Decimal,
): Decimal | DecimalRangeFilter | undefined {
  if (eq !== undefined) return eq;
  if (min === undefined && max === undefined) return undefined;
  return {
    ...(min !== undefined ? { gte: min } : {}),
    ...(max !== undefined ? { lte: max } : {}),
  };
}

export const positiveMoneySchema = z
  .number()
  .positive()
  .multipleOf(0.01)
  .max(MAX_MONEY)
  .transform(toMoney);

export const nonNegativeMoneySchema = z
  .number()
  .nonnegative()
  .multipleOf(0.01)
  .max(MAX_MONEY)
  .transform(toMoney);

export const nonNegativeMoneyQuerySchema = z.coerce
  .number()
  .nonnegative()
  .multipleOf(0.01)
  .max(MAX_MONEY)
  .transform(toMoney);
