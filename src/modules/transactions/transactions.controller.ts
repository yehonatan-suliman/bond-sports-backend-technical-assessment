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
  SearchTransactionsDto,
  StatementResponseDto,
  TransactionResponseDto,
} from './dto/transaction.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post(':accountId/deposits')
  @ApiOperation({ summary: 'Deposit money into an account' })
  async deposit(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const tx = await this.service.deposit(accountId, dto);
    return TransactionResponseDto.from(tx);
  }

  @Post(':accountId/withdrawals')
  @ApiOperation({ summary: 'Withdraw money from an account' })
  async withdraw(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const tx = await this.service.withdraw(accountId, dto);
    return TransactionResponseDto.from(tx);
  }

  @Get()
  @ApiOperation({
    summary:
      'Search transactions by optional filters (accountId, type, value/min/max, from/to). Returns matching list plus totals.',
  })
  search(
    @Query() filters: SearchTransactionsDto,
  ): Promise<StatementResponseDto> {
    return this.service.search(filters);
  }
}
