import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { PasskeyService } from './passkey.service';
import {
  ChallengeRequestDto,
  ChallengeResponseDto,
  VerifyRequestDto,
  VerifyResponseDto,
} from './dto/passkey.dto';

@Controller('passkey')
export class PasskeyController {
  private readonly logger = new Logger(PasskeyController.name);

  constructor(private readonly passkeyService: PasskeyService) {}

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

  @Get('stats')
  getStats() {
    this.logger.log('[GET /passkey/stats] Request');
    const result = this.passkeyService.getStorageStats();
    this.logger.log(`[GET /passkey/stats] Response: ${JSON.stringify(result)}`);
    return result;
  }
}
