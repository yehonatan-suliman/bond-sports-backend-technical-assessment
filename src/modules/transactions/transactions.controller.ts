import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateTransactionDto,
  StatementQueryDto,
  StatementResponseDto,
  TransactionResponseDto,
} from './dto/transaction.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@Controller('accounts/:accountId')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post('deposits')
  @ApiOperation({ summary: 'Deposit money into an account' })
  async deposit(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const tx = await this.service.deposit(accountId, dto);
    return TransactionResponseDto.from(tx);
  }

  @Post('withdrawals')
  @ApiOperation({ summary: 'Withdraw money from an account' })
  async withdraw(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const tx = await this.service.withdraw(accountId, dto);
    return TransactionResponseDto.from(tx);
  }

  @Get('statement')
  @ApiOperation({ summary: 'Get account statement filtered by period' })
  getStatement(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query() query: StatementQueryDto,
  ): Promise<StatementResponseDto> {
    return this.service.getStatement(accountId, query);
  }
}
