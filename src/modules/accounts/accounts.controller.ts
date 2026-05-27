import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import {
  AccountResponseDto,
  CreateAccountDto,
  SearchAccountsDto,
  UpdateLimitDto,
} from './dto/account.dto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new account' })
  async create(@Body() dto: CreateAccountDto) {
    const account = await this.service.create(dto);
    return AccountResponseDto.from(account);
  }

  @Get()
  @ApiOperation({ summary: 'Search accounts by optional filters' })
  async search(@Query() filters: SearchAccountsDto) {
    const accounts = await this.service.search(filters);
    return accounts.map(AccountResponseDto.from);
  }

  @Get(':accountId')
  @ApiOperation({ summary: 'Get an account by id' })
  async getById(@Param('accountId', new ParseUUIDPipe()) accountId: string) {
    const account = await this.service.getById(accountId);
    return AccountResponseDto.from(account);
  }

  @Patch(':accountId/limit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the daily withdrawal limit' })
  async updateLimit(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: UpdateLimitDto,
  ) {
    await this.service.updateLimit(accountId, dto);
    return { message: 'Daily withdrawal limit updated' };
  }

  @Patch(':accountId/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block (deactivate) an account' })
  async block(@Param('accountId', new ParseUUIDPipe()) accountId: string) {
    await this.service.block(accountId);
    return { message: 'Account blocked' };
  }

  @Patch(':accountId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a blocked account' })
  async activate(@Param('accountId', new ParseUUIDPipe()) accountId: string) {
    await this.service.activate(accountId);
    return { message: 'Account activated' };
  }
}
