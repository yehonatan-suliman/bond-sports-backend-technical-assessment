import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DatabaseService } from './database/database.service';
import { SWAGGER_PATH, setupSwagger } from './util/swagger.util';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  let app: INestApplication;
  try {
    app = await NestFactory.create(AppModule);
  } catch (error) {
    logger.error(
      'Failed to start application — could not initialize modules',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  }

  try {
    const db = app.get(DatabaseService);
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.error(
      'Failed to connect to the database. Check DATABASE_URL and that Postgres is reachable.',
      error instanceof Error ? error.stack : String(error),
    );
    await app.close();
    process.exit(1);
  }

  app.enableShutdownHooks();
  setupSwagger(app);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  const url = await app.getUrl();
  logger.log(`API listening on ${url}`);
  logger.log(`Swagger UI at  ${url}/${SWAGGER_PATH}`);
}

bootstrap();
