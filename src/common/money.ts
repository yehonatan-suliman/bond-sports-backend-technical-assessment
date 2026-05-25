import { Decimal } from 'decimal.js';
import { MONEY_DECIMAL_PLACES } from './constants';

export type MoneyInput = string | number | Decimal;

export const toMoney = (value: MoneyInput): Decimal =>
  new Decimal(value).toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);

export const moneyToString = (value: Decimal): string =>
  value.toFixed(MONEY_DECIMAL_PLACES);

export const isPositive = (value: Decimal): boolean => value.gt(0);
