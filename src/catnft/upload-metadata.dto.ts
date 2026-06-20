import { IsOptional, IsString } from 'class-validator';

export class UploadMetadataDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** image as base64 string (data URL or raw base64) */
  @IsString()
  imageBase64!: string;
}
