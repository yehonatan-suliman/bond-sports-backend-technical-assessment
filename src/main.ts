import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SWAGGER_PATH, setupSwagger } from './util/swagger.util';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
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
