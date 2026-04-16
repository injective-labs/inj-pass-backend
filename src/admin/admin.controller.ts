import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class AdminUsersQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  hasChancePurchase?: string;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'ninjaBalance', 'aiWalletCount'])
  sortBy?: 'createdAt' | 'ninjaBalance' | 'aiWalletCount';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}

class AdminPasskeyCredentialsQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

class AdminListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

class AdjustBalanceDto {
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsString()
  @IsIn(['set', 'increment'])
  mode!: 'set' | 'increment';

  @IsOptional()
  @IsString()
  reason?: string;
}

class IngestChancePurchaseDto {
  @IsString()
  txHash!: string;

  @IsString()
  walletAddress!: string;

  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  chanceAmount!: number;

  @Type(() => Number)
  @IsNumber()
  cooldownEndsAt!: number;

  @IsOptional()
  @IsString()
  chainId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  blockNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  logIndex?: number;
}

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.searchUsers(query);
  }

  @Get('passkey-credentials')
  async getPasskeyCredentials(@Query() query: AdminPasskeyCredentialsQueryDto) {
    return this.adminService.searchPasskeyCredentials(query);
  }

  @Get('users/:id')
  async getUserDetail(@Param('id', ParseIntPipe) id: number) {
    const detail = await this.adminService.getUserDetail(id);
    if (!detail) {
      throw new NotFoundException('User not found');
    }

    return detail;
  }

  @Get('users/:id/ai-wallets')
  async getUserAiWallets(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AdminListQueryDto,
  ) {
    const result = await this.adminService.getUserAiWallets(id, query);
    if (!result) {
      throw new NotFoundException('User not found');
    }
    return result;
  }

  @Get('users/:id/ai-wallets/:address')
  async getUserAiWalletDetail(
    @Param('id', ParseIntPipe) id: number,
    @Param('address') address: string,
    @Query() query: AdminListQueryDto,
  ) {
    const detail = await this.adminService.getUserAiWalletDetail(id, address, query);
    if (!detail) {
      throw new NotFoundException('AI wallet not found');
    }
    return detail;
  }

  @Get('users/:id/chance-purchases')
  async getUserChancePurchases(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AdminListQueryDto,
  ) {
    const result = await this.adminService.getUserChancePurchases(id, query);
    if (!result) {
      throw new NotFoundException('User not found');
    }
    return result;
  }

  @Patch('users/:id/ninja-balance')
  async adjustUserBalance(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdjustBalanceDto,
  ) {
    const result = await this.adminService.adjustUserBalance({
      userId: id,
      amount: body.amount,
      mode: body.mode,
      reason: body.reason,
    });

    if (!result) {
      throw new NotFoundException('User not found');
    }

    return result;
  }

  @Patch('chance/purchase-webhook')
  async ingestChancePurchase(@Body() body: IngestChancePurchaseDto) {
    const result = await this.adminService.ingestChancePurchase({
      txHash: body.txHash,
      walletAddress: body.walletAddress,
      productId: body.productId,
      chanceAmount: body.chanceAmount,
      cooldownEndsAt: body.cooldownEndsAt,
      chainId: body.chainId,
      blockNumber: body.blockNumber,
      logIndex: body.logIndex,
    });

    return {
      success: true,
      ...result,
    };
  }
}
