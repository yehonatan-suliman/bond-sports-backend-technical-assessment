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
  StatementQueryDto,
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
      'Search transactions by optional filters (accountId, type, value/min/max, from/to). Returns the matching list.',
  })
  async search(
    @Query() filters: SearchTransactionsDto,
  ): Promise<TransactionResponseDto[]> {
    const transactions = await this.service.search(filters);
    return transactions.map(TransactionResponseDto.from);
  }

  @Get(':accountId/statement')
  @ApiOperation({
    summary:
      'Account statement for a period (default: last 30 days). Optional `type` filters the list; totals and balances always reflect the full period.',
  })
  getStatement(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query() query: StatementQueryDto,
  ): Promise<StatementResponseDto> {
    return this.service.getStatement(accountId, query);
  }
}
