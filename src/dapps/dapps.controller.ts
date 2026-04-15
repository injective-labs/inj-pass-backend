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
  STORED_DAPP_TOOL_IDS,
  STORED_TOOL_DEFINITIONS,
  type StoredDAppCategory,
  type StoredDAppPrimaryCategory,
  type StoredDAppToolId,
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
  primaryCategory?: StoredDAppPrimaryCategory;

  @IsOptional()
  @IsBoolean()
  aiDriven?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(STORED_DAPP_TOOL_IDS, { each: true })
  toolIds?: StoredDAppToolId[];

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
  aiPrompt?: string;

  @IsOptional()
  @IsString()
  aiPromptVersion?: string;

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
    return { dapps, tabs, tools: STORED_TOOL_DEFINITIONS };
  }

  @UseGuards(AdminGuard)
  @Get('admin')
  async getAdminDapps(@Query('query') query?: string) {
    const [dapps, tabs] = await Promise.all([
      this.dappsService.getAdminDapps(query),
      this.dappsService.getAdminTabs(),
    ]);
    return { dapps, tabs, tools: STORED_TOOL_DEFINITIONS };
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
