import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { Account } from '../../generated/prisma/client';
import { AccountsRepository } from './accounts.repository';
import { AccountsService } from './accounts.service';

const buildAccount = (overrides: Partial<Account> = {}): Account => ({
  accountId: '11111111-1111-1111-1111-111111111111',
  personId: '12345678901234567890',
  balance: new Decimal(0) as unknown as Account['balance'],
  dailyWithdrawalLimit: new Decimal(1000) as unknown as Account['dailyWithdrawalLimit'],
  activeFlag: true,
  accountType: 1,
  createDate: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('AccountsService', () => {
  let service: AccountsService;
  let repository: jest.Mocked<AccountsRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<AccountsRepository>> = {
      create: jest.fn(),
      findById: jest.fn(),
      findByPersonId: jest.fn(),
      findByPersonAndType: jest.fn(),
      updateLimit: jest.fn(),
      setActiveFlag: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: AccountsRepository, useValue: repoMock },
      ],
    }).compile();

    service = module.get(AccountsService);
    repository = module.get(AccountsRepository);
  });

  describe('create', () => {
    it('persists an account with normalized money values', async () => {
      const account = buildAccount();
      repository.create.mockResolvedValue(account);

      await service.create({
        personId: account.personId,
        accountType: 1,
        dailyWithdrawalLimit: 1000.005,
        initialBalance: 50,
      });

      expect(repository.create).toHaveBeenCalledTimes(1);
      const arg = repository.create.mock.calls[0][0];
      expect(arg.personId).toBe(account.personId);
      expect(arg.accountType).toBe(1);
      expect(String(arg.dailyWithdrawalLimit)).toBe('1000.01');
      expect(String(arg.balance)).toBe('50');
    });

    it('defaults initial balance to 0', async () => {
      repository.create.mockResolvedValue(buildAccount());

      await service.create({
        personId: '12345678901234567890',
        accountType: 2,
        dailyWithdrawalLimit: 500,
      });

      const arg = repository.create.mock.calls[0][0];
      expect(String(arg.balance)).toBe('0');
    });

    it('throws ConflictException when the person already has that account type', async () => {
      const existing = buildAccount();
      repository.findByPersonAndType.mockResolvedValue(existing);

      await expect(
        service.create({
          personId: existing.personId,
          accountType: 1,
          dailyWithdrawalLimit: 500,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('returns the account when found', async () => {
      const account = buildAccount();
      repository.findById.mockResolvedValue(account);

      await expect(service.getById(account.accountId)).resolves.toBe(account);
    });

    it('throws NotFoundException when missing', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('block / activate', () => {
    it('blocks an existing account', async () => {
      const account = buildAccount();
      repository.findById.mockResolvedValue(account);
      repository.setActiveFlag.mockResolvedValue({ ...account, activeFlag: false });

      const result = await service.block(account.accountId);
      expect(repository.setActiveFlag).toHaveBeenCalledWith(account.accountId, false);
      expect(result.activeFlag).toBe(false);
    });

    it('activates an existing account', async () => {
      const account = buildAccount({ activeFlag: false });
      repository.findById.mockResolvedValue(account);
      repository.setActiveFlag.mockResolvedValue({ ...account, activeFlag: true });

      const result = await service.activate(account.accountId);
      expect(repository.setActiveFlag).toHaveBeenCalledWith(account.accountId, true);
      expect(result.activeFlag).toBe(true);
    });
  });
});
