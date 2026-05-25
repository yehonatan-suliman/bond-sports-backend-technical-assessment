import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';

describe('Accounts & Transactions (e2e)', () => {
  let app: INestApplication<App>;
  let db: DatabaseService;
  const personId = randomUUID();

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await db.transaction.deleteMany({ where: { account: { personId } } });
    await db.account.deleteMany({ where: { personId } });
    await app.close();
  });

  it('creates an account, deposits, withdraws, and returns a statement', async () => {
    const create = await request(app.getHttpServer())
      .post('/accounts')
      .send({
        personId,
        accountType: 1,
        dailyWithdrawalLimit: 500,
        initialBalance: 1000,
      })
      .expect(201);

    const accountId = create.body.accountId as string;
    expect(create.body.balance).toBe('1000.00');
    expect(create.body.activeFlag).toBe(true);

    await request(app.getHttpServer())
      .post(`/accounts/${accountId}/deposits`)
      .send({ value: 250 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/accounts/${accountId}/withdrawals`)
      .send({ value: 400 })
      .expect(201);

    const get = await request(app.getHttpServer()).get(`/accounts/${accountId}`).expect(200);
    expect(get.body.balance).toBe('850.00');

    const statement = await request(app.getHttpServer())
      .get(`/accounts/${accountId}/statement`)
      .expect(200);

    expect(statement.body.transactions).toHaveLength(2);
    expect(statement.body.totalDeposits).toBe('250.00');
    expect(statement.body.totalWithdrawals).toBe('400.00');
    expect(statement.body.netAmount).toBe('-150.00');
  });

  it('rejects withdrawals that exceed the daily limit', async () => {
    const create = await request(app.getHttpServer())
      .post('/accounts')
      .send({
        personId,
        accountType: 2,
        dailyWithdrawalLimit: 100,
        initialBalance: 1000,
      })
      .expect(201);

    const accountId = create.body.accountId as string;

    await request(app.getHttpServer())
      .post(`/accounts/${accountId}/withdrawals`)
      .send({ value: 60 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/accounts/${accountId}/withdrawals`)
      .send({ value: 50 })
      .expect(422);
  });

  it('rejects transactions on a blocked account', async () => {
    const create = await request(app.getHttpServer())
      .post('/accounts')
      .send({
        personId,
        accountType: 1,
        dailyWithdrawalLimit: 500,
        initialBalance: 100,
      })
      .expect(201);

    const accountId = create.body.accountId as string;

    await request(app.getHttpServer()).patch(`/accounts/${accountId}/block`).expect(200);

    await request(app.getHttpServer())
      .post(`/accounts/${accountId}/deposits`)
      .send({ value: 10 })
      .expect(403);
  });

  it('rejects invalid input with 400', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ personId: 'not-a-uuid', accountType: 9, dailyWithdrawalLimit: -5 })
      .expect(400);
  });
});
