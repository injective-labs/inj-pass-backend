import { Controller, Get, Post, Body, Headers, Logger } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { AuthService } from '../auth/auth.service';

class ValidateInviteCodeDto {
  inviteCode: string;
}

@Controller('referral')
export class ReferralController {
  private readonly logger = new Logger(ReferralController.name);

  constructor(
    private readonly referralService: ReferralService,
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
   * Get user's invite code
   */
  @Get('code')
  async getInviteCode(@Headers('authorization') authHeader: string) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { inviteCode: null };
    }

    const result = await this.referralService.getInviteCode(credentialId);
    return result || { inviteCode: null };
  }

  /**
   * Validate invite code
   */
  @Post('validate')
  async validateInviteCode(@Body() dto: ValidateInviteCodeDto) {
    return this.referralService.validateInviteCode(dto.inviteCode);
  }

  /**
   * Get referral stats
   */
  @Get('stats')
  async getStats(@Headers('authorization') authHeader: string) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { inviteCode: '', inviteeCount: 0, totalRewards: 0 };
    }

    return this.referralService.getStats(credentialId);
  }
}
