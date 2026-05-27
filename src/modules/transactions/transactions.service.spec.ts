import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { DatabaseService } from '../../database/database.service';
import { Transaction } from '../../generated/prisma/client';
import { toMoney } from '../../util/moneyCalc.util';
import { TransactionsService } from './transactions.service';

interface AccountRow {
  account_id: string;
  balance: Decimal;
  daily_withdrawal_limit: Decimal;
  active_flag: boolean;
  account_type: number;
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

const buildRow = (overrides: Partial<AccountRow> = {}): AccountRow => ({
  account_id: ACCOUNT_ID,
  balance: new Decimal(1000),
  daily_withdrawal_limit: new Decimal(500),
  active_flag: true,
  account_type: 2,
  ...overrides,
});

const buildTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  transactionId: '33333333-3333-3333-3333-333333333333',
  accountId: ACCOUNT_ID,
  value: new Decimal(100) as unknown as Transaction['value'],
  type: 'DEPOSIT',
  transactionDate: new Date('2026-05-25T12:00:00Z'),
  ...overrides,
});

type InnerTx = {
  $queryRaw: jest.Mock;
  transaction: { aggregate: jest.Mock; create: jest.Mock };
  account: { update: jest.Mock };
};

describe('TransactionsService', () => {
  let service: TransactionsService;
  let innerTx: InnerTx;
  let db: {
    account: { findUnique: jest.Mock };
    transaction: { findMany: jest.Mock; groupBy: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    innerTx = {
      $queryRaw: jest.fn(),
      transaction: { aggregate: jest.fn(), create: jest.fn() },
      account: { update: jest.fn() },
    };

    db = {
      account: { findUnique: jest.fn() },
      transaction: { findMany: jest.fn(), groupBy: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: InnerTx) => unknown) =>
        fn(innerTx),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  describe('deposit', () => {
    it('credits the account and records the transaction', async () => {
      innerTx.$queryRaw.mockResolvedValue([buildRow()]);
      innerTx.account.update.mockResolvedValue({});
      const created = buildTx({
        value: new Decimal(250) as unknown as Transaction['value'],
      });
      innerTx.transaction.create.mockResolvedValue(created);

      const result = await service.deposit(ACCOUNT_ID, { value: toMoney(250) });

      expect(result).toBe(created);
      const createArg = innerTx.transaction.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('DEPOSIT');
      const updateArg = innerTx.account.update.mock.calls[0][0];
      expect(String(updateArg.data.balance)).toBe('1250');
    });

    it('rejects deposits to blocked accounts', async () => {
      innerTx.$queryRaw.mockResolvedValue([buildRow({ active_flag: false })]);
      await expect(
        service.deposit(ACCOUNT_ID, { value: toMoney(100) }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-positive values', async () => {
      await expect(
        service.deposit(ACCOUNT_ID, { value: toMoney(0) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('withdraw', () => {
    it('debits the account when within balance and daily limit', async () => {
      innerTx.$queryRaw.mockResolvedValue([buildRow()]);
      innerTx.transaction.aggregate.mockResolvedValue({
        _sum: { value: new Decimal(0) },
      });
      innerTx.account.update.mockResolvedValue({});
      const created = buildTx({
        type: 'WITHDRAWAL',
        value: new Decimal(200) as unknown as Transaction['value'],
      });
      innerTx.transaction.create.mockResolvedValue(created);

      const result = await service.withdraw(ACCOUNT_ID, {
        value: toMoney(200),
      });

      expect(result).toBe(created);
      const createArg = innerTx.transaction.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('WITHDRAWAL');
      const updateArg = innerTx.account.update.mock.calls[0][0];
      expect(String(updateArg.data.balance)).toBe('800');
    });

    it('rejects when SAVINGS balance is insufficient', async () => {
      innerTx.$queryRaw.mockResolvedValue([
        buildRow({ balance: new Decimal(50), account_type: 2 }),
      ]);
      innerTx.transaction.aggregate.mockResolvedValue({
        _sum: { value: new Decimal(0) },
      });
      await expect(
        service.withdraw(ACCOUNT_ID, { value: toMoney(100) }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('allows CHECKING overdraft past zero balance', async () => {
      innerTx.$queryRaw.mockResolvedValue([
        buildRow({ balance: new Decimal(50), account_type: 1 }),
      ]);
      innerTx.transaction.aggregate.mockResolvedValue({
        _sum: { value: new Decimal(0) },
      });
      innerTx.account.update.mockResolvedValue({});
      const created = buildTx({
        type: 'WITHDRAWAL',
        value: new Decimal(100) as unknown as Transaction['value'],
      });
      innerTx.transaction.create.mockResolvedValue(created);

      await expect(
        service.withdraw(ACCOUNT_ID, { value: toMoney(100) }),
      ).resolves.toBe(created);
      const updateArg = innerTx.account.update.mock.calls[0][0];
      expect(String(updateArg.data.balance)).toBe('-50');
    });

    it('rejects when daily withdrawal limit would be exceeded', async () => {
      innerTx.$queryRaw.mockResolvedValue([buildRow()]);
      innerTx.transaction.aggregate.mockResolvedValue({
        _sum: { value: new Decimal(400) },
      });
      await expect(
        service.withdraw(ACCOUNT_ID, { value: toMoney(150) }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('allows a withdrawal that exactly hits the daily limit', async () => {
      innerTx.$queryRaw.mockResolvedValue([buildRow()]);
      innerTx.transaction.aggregate.mockResolvedValue({
        _sum: { value: new Decimal(400) },
      });
      innerTx.account.update.mockResolvedValue({});
      const created = buildTx({ type: 'WITHDRAWAL' });
      innerTx.transaction.create.mockResolvedValue(created);

      await expect(
        service.withdraw(ACCOUNT_ID, { value: toMoney(100) }),
      ).resolves.toBe(created);
    });
  });

  describe('search', () => {
    it('returns the matching transaction rows from the DB', async () => {
      const rows = [
        buildTx({
          type: 'DEPOSIT',
          value: new Decimal(300) as unknown as Transaction['value'],
        }),
        buildTx({
          type: 'WITHDRAWAL',
          value: new Decimal(120) as unknown as Transaction['value'],
        }),
      ];
      db.transaction.findMany.mockResolvedValue(rows);

      const result = await service.search({ accountId: ACCOUNT_ID });

      expect(result).toBe(rows);
      expect(result).toHaveLength(2);
    });

    it('rejects an inverted date range', async () => {
      const from = '2026-05-10T00:00:00.000Z';
      const to = '2026-05-01T00:00:00.000Z';
      await expect(service.search({ from, to })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('getStatement', () => {
    it('throws NotFoundException when the account does not exist', async () => {
      db.account.findUnique.mockResolvedValue(null);
      await expect(
        service.getStatement(ACCOUNT_ID, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('computes deposit/withdrawal totals over a period', async () => {
      db.account.findUnique.mockResolvedValue({ accountId: ACCOUNT_ID });
      const from = '2026-05-01T00:00:00.000Z';
      const to = '2026-05-31T23:59:59.999Z';
      db.transaction.groupBy.mockResolvedValueOnce([
        { type: 'DEPOSIT', _sum: { value: new Decimal(150) } },
        { type: 'WITHDRAWAL', _sum: { value: new Decimal(100) } },
      ]);
      db.transaction.findMany.mockResolvedValue([
        buildTx({
          type: 'DEPOSIT',
          value: new Decimal(150) as unknown as Transaction['value'],
          transactionDate: new Date('2026-05-05T00:00:00Z'),
        }),
        buildTx({
          type: 'WITHDRAWAL',
          value: new Decimal(100) as unknown as Transaction['value'],
          transactionDate: new Date('2026-05-20T00:00:00Z'),
        }),
      ]);

      const statement = await service.getStatement(ACCOUNT_ID, { from, to });

      expect(statement.totalDeposits).toBe('150.00');
      expect(statement.totalWithdrawals).toBe('100.00');
      expect(statement.transactions).toHaveLength(2);
      expect(statement).not.toHaveProperty('openingBalance');
      expect(statement).not.toHaveProperty('closingBalance');
    });

    it('defaults `from` to 30 days before `to` when omitted', async () => {
      db.account.findUnique.mockResolvedValue({ accountId: ACCOUNT_ID });
      db.transaction.groupBy.mockResolvedValue([]);
      db.transaction.findMany.mockResolvedValue([]);
      const to = '2026-05-31T00:00:00.000Z';

      const statement = await service.getStatement(ACCOUNT_ID, { to });

      const fromDate = new Date(statement.from);
      const toDate = new Date(statement.to);
      const diffDays =
        (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBe(30);
    });

    it('filters the listed transactions by type but keeps full-period totals', async () => {
      db.account.findUnique.mockResolvedValue({ accountId: ACCOUNT_ID });
      const from = '2026-05-01T00:00:00.000Z';
      const to = '2026-05-31T23:59:59.999Z';
      db.transaction.groupBy.mockResolvedValueOnce([
        { type: 'DEPOSIT', _sum: { value: new Decimal(150) } },
        { type: 'WITHDRAWAL', _sum: { value: new Decimal(100) } },
      ]);
      db.transaction.findMany.mockResolvedValue([
        buildTx({
          type: 'DEPOSIT',
          value: new Decimal(150) as unknown as Transaction['value'],
          transactionDate: new Date('2026-05-05T00:00:00Z'),
        }),
      ]);

      const statement = await service.getStatement(ACCOUNT_ID, {
        from,
        to,
        type: 'DEPOSIT',
      });

      expect(statement.transactions).toHaveLength(1);
      expect(statement.transactions[0].type).toBe('DEPOSIT');
      expect(statement.totalDeposits).toBe('150.00');
      expect(statement.totalWithdrawals).toBe('100.00');
    });

    it('rejects an inverted date range', async () => {
      db.account.findUnique.mockResolvedValue({ accountId: ACCOUNT_ID });
      const from = '2026-05-10T00:00:00.000Z';
      const to = '2026-05-01T00:00:00.000Z';
      await expect(
        service.getStatement(ACCOUNT_ID, { from, to }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
