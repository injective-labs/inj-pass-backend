import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  Logger,
} from '@nestjs/common';
import { PointsService } from './points.service';
import { AuthService } from '../auth/auth.service';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsBoolean,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class SyncPointsDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  earnedNinja?: number;

  @IsOptional()
  consumeChance?: boolean;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  chanceCooldownSeconds?: number;
}

class NinjaMinerStateDto {
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  ninjaBalance!: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  chanceRemaining: number = 0;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  tapCooldownEndsAt!: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  chanceCooldownEndsAt: number = 0;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  sessionStartedAt!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  sessionEndsAt!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  sessionEarned!: number;

  @IsOptional()
  @IsBoolean()
  sessionUsesChance?: boolean;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  cooldownEndsAt?: number;
}

class SaveNinjaMinerStateDto {
  @IsString()
  walletAddress!: string;

  @ValidateNested()
  @Type(() => NinjaMinerStateDto)
  state!: NinjaMinerStateDto;
}

class ConsumeChanceDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  cooldownSeconds?: number;
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
      this.logger.warn(
        `Invalid earnedNinja payload: type=${typeof dto}, body=${JSON.stringify(dto)}`,
      );
      return { success: false, error: 'Invalid earnedNinja' };
    }

    this.logger.log(`Sync points request: ${earnedNinja} NINJA`);

    try {
      const result = await this.pointsService.syncNinja(
        credentialId,
        earnedNinja,
        {
          consumeChance: Boolean(dto.consumeChance),
          chanceCooldownSeconds: dto.chanceCooldownSeconds,
          walletAddress: dto.walletAddress,
        },
      );
      return { success: true, ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      this.logger.error(`Sync points failed: ${message}`);
      return { success: false, error: message };
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

    const state = await this.pointsService.getNinjaMinerState(
      credentialId,
      walletAddress,
    );
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
      {
        ninjaBalance: dto.state.ninjaBalance,
        chanceRemaining: dto.state.chanceRemaining ?? 0,
        tapCooldownEndsAt: dto.state.tapCooldownEndsAt,
        chanceCooldownEndsAt: dto.state.chanceCooldownEndsAt ?? 0,
        sessionStartedAt: dto.state.sessionStartedAt,
        sessionEndsAt: dto.state.sessionEndsAt,
        sessionEarned: dto.state.sessionEarned,
        sessionUsesChance: Boolean(dto.state.sessionUsesChance),
        cooldownEndsAt: dto.state.cooldownEndsAt,
      },
    );

    return { success: true, state };
  }

  /**
   * Consume one chance on backend so chance usage is persisted.
   */
  @Post('chance/consume')
  async consumeChance(
    @Headers('authorization') authHeader: string,
    @Body() dto: ConsumeChanceDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { success: false, error: 'Unauthorized' };
    }

    const cooldownSeconds = Number(dto?.cooldownSeconds ?? 20);

    try {
      return await this.pointsService.consumeChance(
        credentialId,
        cooldownSeconds,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Consume chance failed';
      this.logger.error(`Consume chance failed: ${message}`);
      return { success: false, error: message };
    }
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
