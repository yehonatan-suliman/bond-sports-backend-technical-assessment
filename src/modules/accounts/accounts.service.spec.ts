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
    it('persists an account with normalized money values', async () => {
      const created = buildAccount();
      account.findUnique.mockResolvedValue(null);
      account.create.mockResolvedValue(created);

      await service.create({
        personId: created.personId,
        accountType: 1,
        dailyWithdrawalLimit: toMoney(1000.005),
        initialBalance: toMoney(50),
      });

      expect(account.create).toHaveBeenCalledTimes(1);
      const { data } = account.create.mock.calls[0][0];
      expect(data.personId).toBe(created.personId);
      expect(data.accountType).toBe(1);
      expect(String(data.dailyWithdrawalLimit)).toBe('1000.01');
      expect(String(data.balance)).toBe('50');
    });

    it('throws ConflictException when the person already has that account type', async () => {
      account.findUnique.mockResolvedValue(buildAccount());

      await expect(
        service.create({
          personId: '12345678901234567890',
          accountType: 1,
          dailyWithdrawalLimit: toMoney(500),
          initialBalance: toMoney(0),
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
});
