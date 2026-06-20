import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CatnftService } from './catnft.service';
import { UploadMetadataDto } from './upload-metadata.dto';
import { AdminGuard } from '../admin/admin.guard';
import { AuthService } from '../auth/auth.service';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

class IssueMintVoucherDto {
  @IsOptional()
  @IsNumber()
  quantity?: number;
}

class CreateBatchDto {
  @IsString()
  name!: string;

  @IsString()
  metadataCid!: string;

  @IsOptional()
  @IsString()
  imageCid?: string;

  @IsOptional()
  @IsNumber()
  totalItems?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

class UpsertMetadataItemsDto {
  @IsNumber()
  batchId!: number;

  @IsArray()
  items!: Array<{
    serialNo: number;
    name: string;
    description?: string;
    image?: string;
    attributes?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
  }>;
}

class RecordMintDto {
  @IsOptional()
  @IsString()
  tokenId?: string;

  @IsString()
  txHash!: string;

  @IsString()
  ownerAddress!: string;

  @IsOptional()
  @IsNumber()
  metadataItemId?: number;

  @IsOptional()
  @IsString()
  mintedAt?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

@Controller('catnft')
export class CatnftController {
  private readonly logger = new Logger(CatnftController.name);
  constructor(
    private readonly catnftService: CatnftService,
    private readonly authService: AuthService,
  ) {}

  private async getCredentialId(authHeader: string): Promise<string> {
    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid authorization format');
    }

    const payload = await this.authService.verifyToken(parts[1]);
    if (!payload?.credentialId) {
      throw new UnauthorizedException('Invalid auth token');
    }

    return payload.credentialId;
  }

  @Get('credits')
  async getCredits(@Headers('authorization') authHeader: string) {
    const credentialId = await this.getCredentialId(authHeader);
    return this.catnftService.getCredits(credentialId);
  }

  @Post('mint-voucher')
  async issueMintVoucher(
    @Headers('authorization') authHeader: string,
    @Body() dto: IssueMintVoucherDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    return this.catnftService.issueMintVoucher(credentialId, dto.quantity ?? 1);
  }

  @Post('mint-record')
  async recordMint(
    @Headers('authorization') authHeader: string,
    @Body() dto: RecordMintDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    return this.catnftService.recordMint(credentialId, dto);
  }

  @UseGuards(AdminGuard)
  @Post('admin/mint-record/backfill')
  async backfillMintRecord(@Body() dto: RecordMintDto) {
    return this.catnftService.backfillMintRecord(dto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/batches')
  async getBatches() {
    return this.catnftService.getBatches();
  }

  @UseGuards(AdminGuard)
  @Post('admin/batches')
  async createBatch(@Body() dto: CreateBatchDto) {
    return this.catnftService.createBatch(dto);
  }

  @UseGuards(AdminGuard)
  @Post('admin/metadata-items')
  async upsertMetadataItems(@Body() dto: UpsertMetadataItemsDto) {
    return this.catnftService.upsertMetadataItems(dto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/metadata-items')
  async getMetadataItems(
    @Query('batchId') batchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catnftService.getMetadataItems(
      batchId ? Number(batchId) : undefined,
      Number(page) || 1,
      Number(limit) || 50,
    );
  }

  @UseGuards(AdminGuard)
  @Get('admin/mints')
  async getMints(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catnftService.getMints(Number(page) || 1, Number(limit) || 30);
  }

  @UseGuards(AdminGuard)
  @Post('upload')
  async uploadMetadata(@Body() dto: UploadMetadataDto) {
    this.logger.log(`Received upload request for ${dto.name}`);
    const result = await this.catnftService.uploadMetadata(dto.name, dto.description, dto.imageBase64);
    return { ok: true, result };
  }
}
