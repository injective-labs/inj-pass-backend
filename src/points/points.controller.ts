import { Controller, Get, Post, Body, Query, Headers, Logger } from '@nestjs/common';
import { PointsService } from './points.service';
import { AuthService } from '../auth/auth.service';

class SyncPointsDto {
  earnedNinjia: number;
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
   * Sync NIJIA from tap game
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

    this.logger.log(`Sync points request: ${dto.earnedNinjia} NIJIA`);

    try {
      const result = await this.pointsService.syncNinjia(credentialId, dto.earnedNinjia);
      return { success: true, ...result };
    } catch (error) {
      this.logger.error(`Sync points failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get NIJIA balance
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
