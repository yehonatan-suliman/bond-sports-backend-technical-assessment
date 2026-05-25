import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';

@Module({
  imports: [ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
