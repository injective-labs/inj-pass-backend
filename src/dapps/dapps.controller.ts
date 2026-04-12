import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DappsService } from './dapps.service';
import { AdminGuard } from '../admin/admin.guard';
import {
  STORED_DAPP_CAPABILITIES,
  STORED_DAPP_PRIMARY_CATEGORIES,
  type StoredDAppCapability,
  type StoredDAppCategory,
  type StoredDAppPrimaryCategory,
} from './dapps.constants';

type UploadedAsset = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

class UpsertDAppDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsArray()
  @IsString({ each: true })
  categories: StoredDAppCategory[];

  @IsOptional()
  @IsString()
  @IsIn(STORED_DAPP_PRIMARY_CATEGORIES)
  primaryCategory?: StoredDAppPrimaryCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(STORED_DAPP_CAPABILITIES, { each: true })
  capabilities?: StoredDAppCapability[];

  @IsOptional()
  @IsBoolean()
  aiDriven?: boolean;

  @IsString()
  url: string;

  @IsString()
  icon: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  mentionPrompt?: string;

  @IsOptional()
  @IsString()
  mentionLabel?: string;

  @IsOptional()
  @IsString()
  mentionThemeKey?: string;
}

class UpdateDAppTabsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DAppTabDto)
  tabs: DAppTabDto[];
}

class BackfillCapabilitiesDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

class DAppTabDto {
  @IsString()
  id: StoredDAppCategory;

  @IsString()
  label: string;

  @IsInt()
  order: number;

  @IsBoolean()
  enabled: boolean;
}

@Controller('dapps')
export class DappsController {
  constructor(private readonly dappsService: DappsService) {}

  @Get()
  async getDapps() {
    const [dapps, tabs] = await Promise.all([
      this.dappsService.getPublicDapps(),
      this.dappsService.getPublicTabs(),
    ]);
    return { dapps, tabs };
  }

  @UseGuards(AdminGuard)
  @Get('admin')
  async getAdminDapps(@Query('query') query?: string) {
    const [dapps, tabs] = await Promise.all([
      this.dappsService.getAdminDapps(query),
      this.dappsService.getAdminTabs(),
    ]);
    return { dapps, tabs };
  }

  @UseGuards(AdminGuard)
  @Put('admin/tabs')
  async updateTabs(@Body() body: UpdateDAppTabsDto) {
    return { tabs: await this.dappsService.saveTabs(body.tabs ?? []) };
  }

  @UseGuards(AdminGuard)
  @Post('admin')
  async createDapp(@Body() body: UpsertDAppDto) {
    return this.dappsService.upsertDapp(body);
  }

  @UseGuards(AdminGuard)
  @Post('admin/backfill-capabilities')
  async backfillCapabilities(@Body() body: BackfillCapabilitiesDto) {
    return this.dappsService.backfillCapabilities({
      dryRun: body.dryRun ?? true,
      overwrite: body.overwrite ?? false,
    });
  }

  @UseGuards(AdminGuard)
  @Put('admin/:id')
  async updateDapp(@Param('id') id: string, @Body() body: UpsertDAppDto) {
    return this.dappsService.upsertDapp({ ...body, id });
  }

  @UseGuards(AdminGuard)
  @Post('admin/upload-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDappImage(@UploadedFile() file: UploadedAsset | undefined) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    return this.dappsService.uploadImage(file);
  }
}
