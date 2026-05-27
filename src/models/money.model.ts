import { toMoney } from 'src/util/calc.util';
import { z } from 'zod';

const MAX_MONEY = 9999999999999.99;

const MoneyBasicSchema = z.coerce
  .number()
  .multipleOf(0.01)
  .max(MAX_MONEY)
  .min(-MAX_MONEY);

export const MoneySchema = MoneyBasicSchema.transform(toMoney);

export const positiveMoneySchema =
  MoneyBasicSchema.positive().transform(toMoney);

export const nonNegativeMoneyQuerySchema =
  MoneyBasicSchema.nonnegative().transform(toMoney);
