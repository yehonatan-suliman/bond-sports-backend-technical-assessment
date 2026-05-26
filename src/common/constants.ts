export const ACCOUNT_TYPE = {
  CHECKING: 1,
  SAVINGS: 2,
} as const;

export type AccountTypeName = keyof typeof ACCOUNT_TYPE;
export type AccountTypeValue = (typeof ACCOUNT_TYPE)[AccountTypeName];

export const ACCOUNT_TYPE_VALUES: readonly AccountTypeValue[] = Object.values(ACCOUNT_TYPE);

export const ACCOUNT_TYPE_NAME: Record<AccountTypeValue, AccountTypeName> = {
  [ACCOUNT_TYPE.CHECKING]: 'CHECKING',
  [ACCOUNT_TYPE.SAVINGS]: 'SAVINGS',
};

export const MONEY_DECIMAL_PLACES = 2;
