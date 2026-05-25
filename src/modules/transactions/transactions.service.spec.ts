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
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

interface AccountRow {
  account_id: string;
  balance: Decimal;
  daily_withdrawal_limit: Decimal;
  active_flag: boolean;
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

const buildRow = (overrides: Partial<AccountRow> = {}): AccountRow => ({
  account_id: ACCOUNT_ID,
  balance: new Decimal(1000),
  daily_withdrawal_limit: new Decimal(500),
  active_flag: true,
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

describe('TransactionsService', () => {
  let service: TransactionsService;
  let repository: jest.Mocked<TransactionsRepository>;
  let queryRaw: jest.Mock;
  let recordMock: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn();
    recordMock = jest.fn();

    const innerTx = { $queryRaw: queryRaw };

    const dbMock = {
      account: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: typeof innerTx) => unknown) => fn(innerTx)),
    } as unknown as DatabaseService;

    const repoMock = {
      sumWithdrawalsInRange: jest.fn(),
      record: recordMock,
      findStatement: jest.fn(),
    } as unknown as jest.Mocked<TransactionsRepository>;

    const module = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: DatabaseService, useValue: dbMock },
        { provide: TransactionsRepository, useValue: repoMock },
      ],
    }).compile();

    service = module.get(TransactionsService);
    repository = module.get(TransactionsRepository);
  });

  describe('deposit', () => {
    it('credits the account and records the transaction', async () => {
      queryRaw.mockResolvedValue([buildRow()]);
      const created = buildTx({ value: new Decimal(250) as unknown as Transaction['value'] });
      recordMock.mockResolvedValue({ transaction: created, account: {} });

      const result = await service.deposit(ACCOUNT_ID, { value: 250 });

      expect(result).toBe(created);
      const recordArg = recordMock.mock.calls[0][1];
      expect(recordArg.type).toBe('DEPOSIT');
      expect(String(recordArg.newBalance)).toBe('1250');
    });

    it('rejects deposits to blocked accounts', async () => {
      queryRaw.mockResolvedValue([buildRow({ active_flag: false })]);
      await expect(service.deposit(ACCOUNT_ID, { value: 100 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-positive values', async () => {
      await expect(service.deposit(ACCOUNT_ID, { value: 0 })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('withdraw', () => {
    it('debits the account when within balance and daily limit', async () => {
      queryRaw.mockResolvedValue([buildRow()]);
      repository.sumWithdrawalsInRange.mockResolvedValue(new Decimal(0) as never);
      const created = buildTx({ type: 'WITHDRAWAL', value: new Decimal(200) as unknown as Transaction['value'] });
      recordMock.mockResolvedValue({ transaction: created, account: {} });

      const result = await service.withdraw(ACCOUNT_ID, { value: 200 });

      expect(result).toBe(created);
      const recordArg = recordMock.mock.calls[0][1];
      expect(recordArg.type).toBe('WITHDRAWAL');
      expect(String(recordArg.newBalance)).toBe('800');
    });

    it('rejects when balance is insufficient', async () => {
      queryRaw.mockResolvedValue([buildRow({ balance: new Decimal(50) })]);
      await expect(service.withdraw(ACCOUNT_ID, { value: 100 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects when daily withdrawal limit would be exceeded', async () => {
      queryRaw.mockResolvedValue([buildRow()]);
      repository.sumWithdrawalsInRange.mockResolvedValue(new Decimal(400) as never);
      await expect(service.withdraw(ACCOUNT_ID, { value: 150 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('allows a withdrawal that exactly hits the daily limit', async () => {
      queryRaw.mockResolvedValue([buildRow()]);
      repository.sumWithdrawalsInRange.mockResolvedValue(new Decimal(400) as never);
      const created = buildTx({ type: 'WITHDRAWAL' });
      recordMock.mockResolvedValue({ transaction: created, account: {} });

      await expect(service.withdraw(ACCOUNT_ID, { value: 100 })).resolves.toBe(created);
    });
  });

  describe('getStatement', () => {
    it('throws when the account does not exist', async () => {
      (service as unknown as { db: { account: { findUnique: jest.Mock } } }).db.account.findUnique.mockResolvedValue(
        null,
      );
      await expect(service.getStatement(ACCOUNT_ID, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns a statement with deposit/withdrawal totals and net amount', async () => {
      (service as unknown as { db: { account: { findUnique: jest.Mock } } }).db.account.findUnique.mockResolvedValue({
        accountId: ACCOUNT_ID,
      });
      repository.findStatement.mockResolvedValue([
        buildTx({ type: 'DEPOSIT', value: new Decimal(300) as unknown as Transaction['value'] }),
        buildTx({ type: 'WITHDRAWAL', value: new Decimal(120) as unknown as Transaction['value'] }),
      ]);

      const statement = await service.getStatement(ACCOUNT_ID, {});

      expect(statement.totalDeposits).toBe('300.00');
      expect(statement.totalWithdrawals).toBe('120.00');
      expect(statement.netAmount).toBe('180.00');
      expect(statement.transactions).toHaveLength(2);
    });

    it('rejects an inverted date range', async () => {
      const from = '2026-05-10T00:00:00.000Z';
      const to = '2026-05-01T00:00:00.000Z';
      await expect(service.getStatement(ACCOUNT_ID, { from, to })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
