import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class ChallengeRequestDto {
  @IsEnum(['register', 'authenticate'])
  @IsNotEmpty()
  action: 'register' | 'authenticate';

  @IsString()
  @IsOptional()
  userId?: string;
}

export class ChallengeResponseDto {
  challenge: string;
  expiresAt: number;
  rpId: string;
  rpName: string;
}

export class VerifyRequestDto {
  @IsString()
  @IsNotEmpty()
  challenge: string;

  @IsNotEmpty()
  attestation: any; // PublicKeyCredential or assertion data
}

export class VerifyResponseDto {
  success: boolean;
  credentialId?: string;
  publicKey?: string;
  verified?: boolean;
  error?: string;
  token?: string; // Session token (30-minute validity)
}
