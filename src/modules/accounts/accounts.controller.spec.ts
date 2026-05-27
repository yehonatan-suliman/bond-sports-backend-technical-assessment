import { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Account } from '../../generated/prisma/client';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

const buildAccount = (overrides: Partial<Account> = {}): Account => ({
  accountId: ACCOUNT_ID,
  personId: '12345678901234567890',
  balance: new Decimal(0) as unknown as Account['balance'],
  dailyWithdrawalLimit: new Decimal(
    500,
  ) as unknown as Account['dailyWithdrawalLimit'],
  activeFlag: true,
  accountType: 1,
  createDate: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

type ServiceMock = {
  create: jest.Mock;
  getById: jest.Mock;
  search: jest.Mock;
  updateLimit: jest.Mock;
  block: jest.Mock;
  activate: jest.Mock;
};

describe('AccountsController (integration)', () => {
  let app: INestApplication<App>;
  let service: ServiceMock;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      getById: jest.fn(),
      search: jest.fn(),
      updateLimit: jest.fn(),
      block: jest.fn(),
      activate: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        { provide: AccountsService, useValue: service },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /accounts', () => {
    it('creates an account and returns the mapped DTO', async () => {
      service.create.mockResolvedValue(buildAccount());

      const res = await request(app.getHttpServer())
        .post('/accounts')
        .send({
          personId: '12345678901234567890',
          accountType: 'CHECKING',
          dailyWithdrawalLimit: 500,
        })
        .expect(201);

      expect(service.create).toHaveBeenCalledTimes(1);
      const dto = service.create.mock.calls[0][0];
      expect(dto.personId).toBe('12345678901234567890');
      expect(dto.accountType).toBe(1);
      expect(String(dto.dailyWithdrawalLimit)).toBe('500');

      expect(res.body.accountId).toBe(ACCOUNT_ID);
      expect(res.body.balance).toBe('0.00');
      expect(res.body.accountType).toBe('CHECKING');
    });

    it('400 when a required field is missing', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .send({ accountType: 1, dailyWithdrawalLimit: 500 })
        .expect(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('400 when initialBalance is sent (strict mode rejects unknown keys)', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .send({
          personId: '12345678901234567890',
          accountType: 1,
          dailyWithdrawalLimit: 500,
          initialBalance: 100,
        })
        .expect(400);
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /accounts', () => {
    it('calls service.search with parsed filters and returns mapped list', async () => {
      service.search.mockResolvedValue([buildAccount(), buildAccount({ accountType: 2 })]);

      const res = await request(app.getHttpServer())
        .get('/accounts?personId=12345678901234567890&activeFlag=true')
        .expect(200);

      expect(service.search).toHaveBeenCalledTimes(1);
      const filters = service.search.mock.calls[0][0];
      expect(filters.personId).toBe('12345678901234567890');
      expect(filters.activeFlag).toBe(true);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('GET /accounts/:accountId', () => {
    it('returns the mapped account', async () => {
      service.getById.mockResolvedValue(buildAccount());

      const res = await request(app.getHttpServer())
        .get(`/accounts/${ACCOUNT_ID}`)
        .expect(200);

      expect(service.getById).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(res.body.accountId).toBe(ACCOUNT_ID);
    });

    it('400 on a malformed UUID', async () => {
      await request(app.getHttpServer()).get('/accounts/not-a-uuid').expect(400);
      expect(service.getById).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /accounts/:accountId/limit', () => {
    it('returns the success message', async () => {
      service.updateLimit.mockResolvedValue(buildAccount());

      const res = await request(app.getHttpServer())
        .patch(`/accounts/${ACCOUNT_ID}/limit`)
        .send({ dailyWithdrawalLimit: 750 })
        .expect(200);

      expect(service.updateLimit).toHaveBeenCalledTimes(1);
      const [id, dto] = service.updateLimit.mock.calls[0];
      expect(id).toBe(ACCOUNT_ID);
      expect(String(dto.dailyWithdrawalLimit)).toBe('750');
      expect(res.body).toEqual({ message: 'Daily withdrawal limit updated' });
    });
  });

  describe('PATCH /accounts/:accountId/block', () => {
    it('returns the success message', async () => {
      service.block.mockResolvedValue(buildAccount({ activeFlag: false }));

      const res = await request(app.getHttpServer())
        .patch(`/accounts/${ACCOUNT_ID}/block`)
        .expect(200);

      expect(service.block).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(res.body).toEqual({ message: 'Account blocked' });
    });
  });

  describe('PATCH /accounts/:accountId/activate', () => {
    it('returns the success message', async () => {
      service.activate.mockResolvedValue(buildAccount());

      const res = await request(app.getHttpServer())
        .patch(`/accounts/${ACCOUNT_ID}/activate`)
        .expect(200);

      expect(service.activate).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(res.body).toEqual({ message: 'Account activated' });
    });
  });
});
