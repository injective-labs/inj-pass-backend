import { Controller, Post, Body, Get, Logger, UseGuards, Headers } from '@nestjs/common';
import { PasskeyService } from './passkey.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ChallengeRequestDto,
  ChallengeResponseDto,
  VerifyRequestDto,
  VerifyResponseDto,
} from './dto/passkey.dto';

@Controller('passkey')
export class PasskeyController {
  private readonly logger = new Logger(PasskeyController.name);

  constructor(
    private readonly passkeyService: PasskeyService,
    private readonly authService: AuthService,
  ) {}

  @Post('challenge')
  async generateChallenge(
    @Body() dto: ChallengeRequestDto,
  ): Promise<ChallengeResponseDto> {
    this.logger.log(`[POST /passkey/challenge] Request: ${JSON.stringify(dto)}`);
    const result = await this.passkeyService.generateChallenge(dto);
    this.logger.log(`[POST /passkey/challenge] Response: ${JSON.stringify({ challenge: result.challenge.substring(0, 20) + '...', rpId: result.rpId })}`);
    return result;
  }

  @Post('verify')
  async verifyPasskey(
    @Body() dto: VerifyRequestDto,
  ): Promise<VerifyResponseDto> {
    this.logger.log(`[POST /passkey/verify] Request: ${JSON.stringify({ challenge: dto.challenge.substring(0, 20) + '...', hasAttestation: !!dto.attestation })}`);
    const result = await this.passkeyService.verifyPasskey(dto);
    this.logger.log(`[POST /passkey/verify] Response: ${JSON.stringify(result)}`);
    return result;
  }

  @Post('verify-token')
  async verifyToken(
    @Headers('authorization') authHeader: string,
  ): Promise<{ valid: boolean; credentialId?: string; userId?: string; expiresAt?: number }> {
    this.logger.log('[POST /passkey/verify-token] Request');

    if (!authHeader) {
      return { valid: false };
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return { valid: false };
    }

    const token = parts[1];
    const payload = await this.authService.verifyToken(token);

    if (!payload) {
      this.logger.log('[POST /passkey/verify-token] Token verification failed');
      return { valid: false };
    }

    this.logger.log(`[POST /passkey/verify-token] Token verified for credential: ${payload.credentialId.substring(0, 20)}...`);
    return {
      valid: true,
      credentialId: payload.credentialId,
      userId: payload.userId,
      expiresAt: payload.exp * 1000, // Convert from seconds to milliseconds
    };
  }

  @Post('refresh-token')
  async refreshToken(
    @Headers('authorization') authHeader: string,
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    this.logger.log('[POST /passkey/refresh-token] Request');

    if (!authHeader) {
      return { success: false, error: 'No authorization header' };
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return { success: false, error: 'Invalid authorization format' };
    }

    const token = parts[1];
    const newToken = await this.authService.refreshToken(token);

    if (!newToken) {
      this.logger.log('[POST /passkey/refresh-token] Token refresh failed');
      return { success: false, error: 'Token refresh failed' };
    }

    this.logger.log('[POST /passkey/refresh-token] Token refreshed successfully');
    return { success: true, token: newToken };
  }

  @Post('logout')
  async logout(
    @Headers('authorization') authHeader: string,
  ): Promise<{ success: boolean; message?: string }> {
    this.logger.log('[POST /passkey/logout] Request');

    if (!authHeader) {
      return { success: false };
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return { success: false };
    }

    const token = parts[1];
    await this.authService.revokeToken(token);

    this.logger.log('[POST /passkey/logout] Token revoked');
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('stats')
  getStats() {
    this.logger.log('[GET /passkey/stats] Request');
    const result = this.passkeyService.getStorageStats();
    this.logger.log(`[GET /passkey/stats] Response: ${JSON.stringify(result)}`);
    return result;
  }
}
