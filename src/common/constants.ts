export const ACCOUNT_TYPE = {
  CHECKING: 1,
  SAVINGS: 2,
} as const;

export type AccountTypeValue = (typeof ACCOUNT_TYPE)[keyof typeof ACCOUNT_TYPE];

export const ACCOUNT_TYPE_VALUES: readonly AccountTypeValue[] = Object.values(ACCOUNT_TYPE);

export const MONEY_DECIMAL_PLACES = 2;
