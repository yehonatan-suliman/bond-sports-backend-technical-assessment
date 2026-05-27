import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { Account } from '../../generated/prisma/client';
import { toMoney } from '../../util/moneyCalc.util';
import { DatabaseService } from '../../database/database.service';
import { AccountsService } from './accounts.service';

const buildAccount = (overrides: Partial<Account> = {}): Account => ({
  accountId: '11111111-1111-1111-1111-111111111111',
  personId: '12345678901234567890',
  balance: new Decimal(0) as unknown as Account['balance'],
  dailyWithdrawalLimit: new Decimal(
    1000,
  ) as unknown as Account['dailyWithdrawalLimit'],
  activeFlag: true,
  accountType: 1,
  createDate: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

type AccountDelegateMock = {
  create: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
};

describe('AccountsService', () => {
  let service: AccountsService;
  let account: AccountDelegateMock;

  beforeEach(async () => {
    account = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: DatabaseService, useValue: { account } },
      ],
    }).compile();

    service = module.get(AccountsService);
  });

  describe('create', () => {
    it('persists an account without setting balance (Prisma default handles it)', async () => {
      const created = buildAccount();
      account.findUnique.mockResolvedValue(null);
      account.create.mockResolvedValue(created);

      await service.create({
        personId: created.personId,
        accountType: 1,
        dailyWithdrawalLimit: toMoney(1000.005),
      });

      expect(account.create).toHaveBeenCalledTimes(1);
      const { data } = account.create.mock.calls[0][0];
      expect(data.personId).toBe(created.personId);
      expect(data.accountType).toBe(1);
      expect(String(data.dailyWithdrawalLimit)).toBe('1000.01');
      expect(data.balance).toBeUndefined();
    });

    it('throws ConflictException when the person already has that account type', async () => {
      account.findUnique.mockResolvedValue(buildAccount());

      await expect(
        service.create({
          personId: '12345678901234567890',
          accountType: 1,
          dailyWithdrawalLimit: toMoney(500),
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(account.create).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('returns the account when found', async () => {
      const found = buildAccount();
      account.findUnique.mockResolvedValue(found);

      await expect(service.getById(found.accountId)).resolves.toBe(found);
    });

    it('throws NotFoundException when missing', async () => {
      account.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('block / activate', () => {
    it('blocks an existing account', async () => {
      const found = buildAccount();
      account.findUnique.mockResolvedValue(found);
      account.update.mockResolvedValue({ ...found, activeFlag: false });

      const result = await service.block(found.accountId);
      expect(account.update).toHaveBeenCalledWith({
        where: { accountId: found.accountId },
        data: { activeFlag: false },
      });
      expect(result.activeFlag).toBe(false);
    });

    it('activates an existing account', async () => {
      const found = buildAccount({ activeFlag: false });
      account.findUnique.mockResolvedValue(found);
      account.update.mockResolvedValue({ ...found, activeFlag: true });

      const result = await service.activate(found.accountId);
      expect(account.update).toHaveBeenCalledWith({
        where: { accountId: found.accountId },
        data: { activeFlag: true },
      });
      expect(result.activeFlag).toBe(true);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      account.findMany.mockResolvedValue([]);
    });

    const whereOf = () => account.findMany.mock.calls[0][0].where;

    it('returns all accounts when no filters are provided', async () => {
      await service.search({});
      expect(whereOf()).toEqual({});
      expect(account.findMany.mock.calls[0][0].orderBy).toEqual({
        createDate: 'desc',
      });
    });

    it('filters by accountId', async () => {
      await service.search({ accountId: '11111111-1111-1111-1111-111111111111' });
      expect(whereOf()).toEqual({
        accountId: '11111111-1111-1111-1111-111111111111',
      });
    });

    it('filters by personId', async () => {
      await service.search({ personId: '12345678901234567890' });
      expect(whereOf()).toEqual({ personId: '12345678901234567890' });
    });

    it('filters by accountType', async () => {
      await service.search({ accountType: 2 });
      expect(whereOf()).toEqual({ accountType: 2 });
    });

    it('filters by activeFlag', async () => {
      await service.search({ activeFlag: false });
      expect(whereOf()).toEqual({ activeFlag: false });
    });

    it('filters by balance equality', async () => {
      await service.search({ balance: toMoney(500) });
      const where = whereOf();
      expect(String(where.balance)).toBe('500');
    });

    it('filters by minBalance only (>= floor)', async () => {
      await service.search({ minBalance: toMoney(100) });
      const where = whereOf();
      expect(String(where.balance.gte)).toBe('100');
      expect(where.balance.lte).toBeUndefined();
    });

    it('filters by maxBalance only (<= ceiling)', async () => {
      await service.search({ maxBalance: toMoney(900) });
      const where = whereOf();
      expect(String(where.balance.lte)).toBe('900');
      expect(where.balance.gte).toBeUndefined();
    });

    it('filters by both minBalance and maxBalance', async () => {
      await service.search({
        minBalance: toMoney(100),
        maxBalance: toMoney(900),
      });
      const where = whereOf();
      expect(String(where.balance.gte)).toBe('100');
      expect(String(where.balance.lte)).toBe('900');
    });

    it('filters by dailyWithdrawalLimit range', async () => {
      await service.search({
        minDailyWithdrawalLimit: toMoney(100),
        maxDailyWithdrawalLimit: toMoney(500),
      });
      const where = whereOf();
      expect(String(where.dailyWithdrawalLimit.gte)).toBe('100');
      expect(String(where.dailyWithdrawalLimit.lte)).toBe('500');
    });

    it('mixes multiple filters into a single where clause', async () => {
      await service.search({
        accountType: 1,
        activeFlag: true,
        minBalance: toMoney(50),
      });
      const where = whereOf();
      expect(where.accountType).toBe(1);
      expect(where.activeFlag).toBe(true);
      expect(String(where.balance.gte)).toBe('50');
    });
  });

  describe('updateLimit', () => {
    it('updates the daily limit on an existing account', async () => {
      const found = buildAccount();
      account.findUnique.mockResolvedValue(found);
      account.update.mockResolvedValue({
        ...found,
        dailyWithdrawalLimit: toMoney(750) as unknown as Account['dailyWithdrawalLimit'],
      });

      await service.updateLimit(found.accountId, {
        dailyWithdrawalLimit: toMoney(750),
      });

      expect(account.update).toHaveBeenCalledWith({
        where: { accountId: found.accountId },
        data: { dailyWithdrawalLimit: toMoney(750) },
      });
    });

    it('throws NotFoundException when the account is missing', async () => {
      account.findUnique.mockResolvedValue(null);
      await expect(
        service.updateLimit('missing', { dailyWithdrawalLimit: toMoney(750) }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(account.update).not.toHaveBeenCalled();
    });
  });
});
