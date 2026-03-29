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

class AdjustBalanceDto {
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsString()
  @IsIn(['set', 'increment'])
  mode: 'set' | 'increment';

  @IsOptional()
  @IsString()
  reason?: string;
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
}
