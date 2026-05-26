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
import { ParsePersonIdPipe } from '../../common/pipes/parse-person-id.pipe';
import { AccountsService } from './accounts.service';
import {
  AccountResponseDto,
  CreateAccountDto,
  UpdateLimitDto,
} from './dto/account.dto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new account' })
  async create(@Body() dto: CreateAccountDto): Promise<AccountResponseDto> {
    const account = await this.service.create(dto);
    return AccountResponseDto.from(account);
  }

  @Get()
  @ApiOperation({ summary: 'List all accounts for a person' })
  async listByPerson(
    @Query('personId', new ParsePersonIdPipe()) personId: string,
  ): Promise<AccountResponseDto[]> {
    const accounts = await this.service.listByPerson(personId);
    return accounts.map(AccountResponseDto.from);
  }

  @Get(':accountId')
  @ApiOperation({ summary: 'Get an account by id' })
  async getById(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<AccountResponseDto> {
    const account = await this.service.getById(accountId);
    return AccountResponseDto.from(account);
  }

  @Patch(':accountId/limit')
  @ApiOperation({ summary: 'Update the daily withdrawal limit' })
  async updateLimit(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: UpdateLimitDto,
  ): Promise<AccountResponseDto> {
    const account = await this.service.updateLimit(accountId, dto);
    return AccountResponseDto.from(account);
  }

  @Patch(':accountId/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block (deactivate) an account' })
  async block(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<AccountResponseDto> {
    const account = await this.service.block(accountId);
    return AccountResponseDto.from(account);
  }

  @Patch(':accountId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a blocked account' })
  async activate(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<AccountResponseDto> {
    const account = await this.service.activate(accountId);
    return AccountResponseDto.from(account);
  }
}
