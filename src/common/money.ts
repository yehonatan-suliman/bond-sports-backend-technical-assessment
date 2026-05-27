import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { MAX_MONEY, MONEY_DECIMAL_PLACES } from './constants';

export type MoneyInput = string | number | Decimal;

export const toMoney = (value: MoneyInput): Decimal =>
  new Decimal(value).toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);

export const moneyToString = (value: Decimal): string =>
  value.toFixed(MONEY_DECIMAL_PLACES);

export const isPositive = (value: Decimal): boolean => value.gt(0);

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
