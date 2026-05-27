import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';

const randomPersonId = (): string =>
  Date.now().toString() +
  Math.floor(Math.random() * 1000).toString().padStart(3, '0');

describe('Accounts (e2e)', () => {
  let app: INestApplication<App>;
  let db: DatabaseService;
  const personId = randomPersonId();
  const personIds = [personId];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await db.transaction.deleteMany({
      where: { account: { personId: { in: personIds } } },
    });
    await db.account.deleteMany({ where: { personId: { in: personIds } } });
    await app.close();
  });

  it('creates an account with balance 0 and returns it by id', async () => {
    const create = await request(app.getHttpServer())
      .post('/accounts')
      .send({ personId, accountType: 1, dailyWithdrawalLimit: 500 })
      .expect(201);

    const accountId = create.body.accountId as string;
    expect(create.body.balance).toBe('0.00');
    expect(create.body.activeFlag).toBe(true);
    expect(create.body.accountType).toBe('CHECKING');

    const get = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(200);
    expect(get.body.accountId).toBe(accountId);
    expect(get.body.personId).toBe(personId);
  });

  it('rejects creating a second account of the same type for the same person', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ personId, accountType: 1, dailyWithdrawalLimit: 500 })
      .expect(409);
  });

  it('rejects unknown body fields (strict-mode 400)', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({
        personId,
        accountType: 1,
        dailyWithdrawalLimit: 500,
        initialBalance: 100,
      })
      .expect(400);
  });

  it('rejects invalid input with 400', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ personId: 'not-digits', accountType: 9, dailyWithdrawalLimit: -5 })
      .expect(400);
  });
});
