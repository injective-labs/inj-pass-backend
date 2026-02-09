import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';
import { ChallengeStorageService } from './challenge-storage.service';
import { AuthService } from '../auth/auth.service';
import {
  ChallengeRequestDto,
  ChallengeResponseDto,
  VerifyRequestDto,
  VerifyResponseDto,
} from './dto/passkey.dto';

@Injectable()
export class PasskeyService {
  private readonly rpName = 'Injective Pass';
  private readonly rpId: string;
  private readonly allowedOrigins: string[];

  constructor(
    private readonly challengeStorage: ChallengeStorageService,
    private readonly authService: AuthService,
  ) {
    if (!process.env.RP_ID) {
      throw new Error('RP_ID environment variable is required');
    }
    const origins = process.env.ORIGINS?.split(',').map(o => o.trim()) || [];
    if (origins.length === 0) {
      throw new Error('ORIGINS environment variable is required');
    }
    this.rpId = process.env.RP_ID;
    this.allowedOrigins = origins;
  }

  /**
   * Generate challenge for registration or authentication
   */
  async generateChallenge(dto: ChallengeRequestDto): Promise<ChallengeResponseDto> {
    try {
      let challenge: string;

      if (dto.action === 'register') {
        const options = await generateRegistrationOptions({
          rpName: this.rpName,
          rpID: this.rpId,
          userName: dto.userId || 'user',
          userDisplayName: dto.userId || 'User',
          timeout: 60000,
          attestationType: 'none',
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            requireResidentKey: false,
            userVerification: 'required',
          },
          supportedAlgorithmIDs: [-7, -257], // ES256, RS256
        });

        challenge = options.challenge;
      } else {
        const options = await generateAuthenticationOptions({
          rpID: this.rpId,
          timeout: 60000,
          userVerification: 'required',
        });

        challenge = options.challenge;
      }

      // Store challenge (async)
      await this.challengeStorage.store(challenge, dto.action, dto.userId);

      return {
        challenge,
        expiresAt: Date.now() + 60000,
        rpId: this.rpId,
        rpName: this.rpName,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to generate challenge: ${error.message}`,
      );
    }
  }

  /**
   * Verify registration or authentication response
   */
  async verifyPasskey(dto: VerifyRequestDto): Promise<VerifyResponseDto> {
    try {
      // Retrieve and validate challenge (async)
      const storedChallenge = await this.challengeStorage.get(dto.challenge);
      
      if (!storedChallenge) {
        throw new UnauthorizedException('Challenge not found or expired');
      }

      // Delete challenge (one-time use, async)
      await this.challengeStorage.delete(dto.challenge);

      const credential = dto.attestation;

      if (storedChallenge.action === 'register') {
        // Verify registration
        const verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: storedChallenge.challenge,
          expectedOrigin: this.allowedOrigins,
          expectedRPID: this.rpId,
          requireUserVerification: true,
        } as VerifyRegistrationResponseOpts);

        if (!verification.verified) {
          return {
            success: false,
            error: 'Registration verification failed',
          };
        }

        const credentialId = verification.registrationInfo?.credential?.id;
        const publicKey = verification.registrationInfo?.credential?.publicKey;
        const counter = verification.registrationInfo?.credential?.counter || 0;

        // Store credential for future authentication (async)
        if (credentialId && publicKey) {
          await this.challengeStorage.storeCredential(
            credentialId,
            publicKey,
            counter,
          );
        }

        // Generate session token (30-minute validity)
        const token = await this.authService.generateToken(credentialId, storedChallenge.userId);

        return {
          success: true,
          credentialId,
          publicKey: Buffer.from(publicKey || []).toString('base64'),
          token,
        };
      } else {
        // Verify authentication
        const credential = dto.attestation;

        if (!credential || !credential.id) {
          throw new UnauthorizedException('Invalid credential format');
        }

        // Look up stored credential (async)
        const storedCredential = await this.challengeStorage.getCredential(credential.id);
        
        if (!storedCredential) {
          throw new UnauthorizedException('Credential not found');
        }

        // Verify authentication with stored public key
        const verification = await verifyAuthenticationResponse({
          response: credential,
          expectedChallenge: storedChallenge.challenge,
          expectedOrigin: this.allowedOrigins,
          expectedRPID: this.rpId,
          requireUserVerification: true,
          credential: {
            id: storedCredential.credentialId,
            publicKey: storedCredential.publicKey,
            counter: storedCredential.counter,
          },
        } as VerifyAuthenticationResponseOpts);

        // Update counter (async)
        if (verification.verified && verification.authenticationInfo) {
          await this.challengeStorage.updateCredentialCounter(
            credential.id,
            verification.authenticationInfo.newCounter,
          );
        }

        // Generate session token (30-minute validity)
        const token = await this.authService.generateToken(storedCredential.credentialId, storedChallenge.userId);

        return {
          success: true,
          verified: verification.verified,
          token,
        };
      }
    } catch (error) {
      throw new BadRequestException(
        `Verification failed: ${error.message}`,
      );
    }
  }

  /**
   * Get storage stats (for debugging)
   */
  async getStorageStats() {
    return {
      challenges: await this.challengeStorage.getStats(),
      credentials: await this.challengeStorage.getCredentialStats(),
    };
  }
}
