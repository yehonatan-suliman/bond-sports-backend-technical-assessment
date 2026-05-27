import { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Transaction } from '../../generated/prisma/client';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

const buildTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  transactionId: '33333333-3333-3333-3333-333333333333',
  accountId: ACCOUNT_ID,
  value: new Decimal(100) as unknown as Transaction['value'],
  type: 'DEPOSIT',
  transactionDate: new Date('2026-05-25T12:00:00Z'),
  ...overrides,
});

type ServiceMock = {
  deposit: jest.Mock;
  withdraw: jest.Mock;
  search: jest.Mock;
  getStatement: jest.Mock;
};

describe('TransactionsController (integration)', () => {
  let app: INestApplication<App>;
  let service: ServiceMock;

  beforeEach(async () => {
    service = {
      deposit: jest.fn(),
      withdraw: jest.fn(),
      search: jest.fn(),
      getStatement: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: service },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /transactions/:accountId/deposits', () => {
    it('calls service.deposit and returns the mapped DTO', async () => {
      service.deposit.mockResolvedValue(buildTx({ type: 'DEPOSIT' }));

      const res = await request(app.getHttpServer())
        .post(`/transactions/${ACCOUNT_ID}/deposits`)
        .send({ value: 250 })
        .expect(201);

      expect(service.deposit).toHaveBeenCalledTimes(1);
      const [id, dto] = service.deposit.mock.calls[0];
      expect(id).toBe(ACCOUNT_ID);
      expect(String(dto.value)).toBe('250');
      expect(res.body.type).toBe('DEPOSIT');
      expect(res.body.value).toBe('100.00');
    });

    it('400 on non-positive value (Zod positive constraint)', async () => {
      await request(app.getHttpServer())
        .post(`/transactions/${ACCOUNT_ID}/deposits`)
        .send({ value: 0 })
        .expect(400);
      expect(service.deposit).not.toHaveBeenCalled();
    });

    it('400 on malformed UUID path param', async () => {
      await request(app.getHttpServer())
        .post(`/transactions/not-a-uuid/deposits`)
        .send({ value: 100 })
        .expect(400);
      expect(service.deposit).not.toHaveBeenCalled();
    });
  });

  describe('POST /transactions/:accountId/withdrawals', () => {
    it('calls service.withdraw and returns the mapped DTO', async () => {
      service.withdraw.mockResolvedValue(buildTx({ type: 'WITHDRAWAL' }));

      const res = await request(app.getHttpServer())
        .post(`/transactions/${ACCOUNT_ID}/withdrawals`)
        .send({ value: 50 })
        .expect(201);

      expect(service.withdraw).toHaveBeenCalledTimes(1);
      expect(res.body.type).toBe('WITHDRAWAL');
    });
  });

  describe('GET /transactions', () => {
    it('calls service.search and returns the mapped list (no totals)', async () => {
      service.search.mockResolvedValue([
        buildTx(),
        buildTx({ type: 'WITHDRAWAL' }),
      ]);

      const res = await request(app.getHttpServer())
        .get('/transactions?type=WITHDRAWAL')
        .expect(200);

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(service.search.mock.calls[0][0].type).toBe('WITHDRAWAL');
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).not.toHaveProperty('totalDeposits');
    });
  });

  describe('GET /transactions/:accountId/statement', () => {
    it('calls service.getStatement and returns the statement shape', async () => {
      service.getStatement.mockResolvedValue({
        accountId: ACCOUNT_ID,
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-31T23:59:59.999Z',
        transactions: [],
        totalDeposits: '150.00',
        totalWithdrawals: '100.00',
      });

      const res = await request(app.getHttpServer())
        .get(`/transactions/${ACCOUNT_ID}/statement?type=DEPOSIT`)
        .expect(200);

      expect(service.getStatement).toHaveBeenCalledTimes(1);
      const [id, query] = service.getStatement.mock.calls[0];
      expect(id).toBe(ACCOUNT_ID);
      expect(query.type).toBe('DEPOSIT');
      expect(res.body.totalDeposits).toBe('150.00');
      expect(res.body.totalWithdrawals).toBe('100.00');
      expect(res.body).not.toHaveProperty('openingBalance');
      expect(res.body).not.toHaveProperty('closingBalance');
    });
  });
});
