import { Controller, Get, Post, Body, Query, Headers, Logger } from '@nestjs/common';
import { PointsService, NinjaMinerState } from './points.service';
import { AuthService } from '../auth/auth.service';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';

class SyncPointsDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  earnedNinja?: number;
}

class NinjaMinerStateDto implements NinjaMinerState {
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  ninjaBalance: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  cooldownEndsAt: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  sessionStartedAt: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  sessionEndsAt: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  sessionEarned: number;
}

class SaveNinjaMinerStateDto {
  @IsString()
  walletAddress: string;

  @ValidateNested()
  @Type(() => NinjaMinerStateDto)
  state: NinjaMinerStateDto;
}

@Controller('points')
export class PointsController {
  private readonly logger = new Logger(PointsController.name);

  constructor(
    private readonly pointsService: PointsService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Extract credential ID from auth header
   */
  private async getCredentialId(authHeader: string): Promise<string | null> {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

    const token = parts[1];
    const payload = await this.authService.verifyToken(token);
    return payload?.credentialId || null;
  }

  /**
   * Sync NINJA from tap game
   */
  @Post('sync')
  async syncPoints(
    @Headers('authorization') authHeader: string,
    @Body() dto: SyncPointsDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { success: false, error: 'Unauthorized' };
    }

    const earnedNinja = Number(dto.earnedNinja);
    if (!Number.isFinite(earnedNinja) || earnedNinja <= 0) {
      this.logger.warn(`Invalid earnedNinja payload: type=${typeof dto}, body=${JSON.stringify(dto)}`);
      return { success: false, error: 'Invalid earnedNinja' };
    }

    this.logger.log(`Sync points request: ${earnedNinja} NINJA`);

    try {
      const result = await this.pointsService.syncNinja(credentialId, earnedNinja);
      return { success: true, ...result };
    } catch (error) {
      this.logger.error(`Sync points failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get NINJA balance
   */
  @Get('balance')
  async getBalance(@Headers('authorization') authHeader: string) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { balance: 0 };
    }

    return this.pointsService.getBalance(credentialId);
  }

  /**
   * Get persisted Ninja Miner session state from Redis
   */
  @Get('ninja-miner-state')
  async getNinjaMinerState(
    @Headers('authorization') authHeader: string,
    @Query('walletAddress') walletAddress?: string,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { state: null };
    }

    const state = await this.pointsService.getNinjaMinerState(credentialId, walletAddress);
    return { state };
  }

  /**
   * Persist Ninja Miner session state to Redis
   */
  @Post('ninja-miner-state')
  async saveNinjaMinerState(
    @Headers('authorization') authHeader: string,
    @Body() dto: SaveNinjaMinerStateDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!dto?.walletAddress || !dto?.state) {
      return { success: false, error: 'Invalid payload' };
    }

    const state = await this.pointsService.saveNinjaMinerState(
      credentialId,
      dto.walletAddress,
      dto.state,
    );

    return { success: true, state };
  }

  /**
   * Get transaction history
   */
  @Get('transactions')
  async getTransactions(
    @Headers('authorization') authHeader: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { transactions: [], total: 0 };
    }

    return this.pointsService.getTransactions(
      credentialId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
