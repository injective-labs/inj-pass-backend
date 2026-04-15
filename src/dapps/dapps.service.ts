import { BadRequestException, Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import {
  StoredDApp,
  StoredDAppCategory,
  StoredDAppPrimaryCategory,
  StoredDAppToolId,
  StoredDAppTab,
  STORED_DAPP_TOOL_IDS,
} from './dapps.constants';

type UploadedAsset = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

type UpsertDAppInput = {
  id?: string;
  name: string;
  description: string;
  categories: StoredDAppCategory[];
  primaryCategory?: StoredDAppPrimaryCategory;
  toolIds?: StoredDAppToolId[];
  aiDriven?: boolean;
  order?: number;
  url: string;
  featured?: boolean;
  icon: string;
  aiPrompt?: string;
  aiPromptVersion?: string;
  mentionPrompt?: string;
  mentionLabel?: string;
  mentionThemeKey?: string;
};

@Injectable()
export class DappsService {
  private readonly cacheKey = 'inj-pass:dapps:directory:v1';
  private readonly tabsCacheKey = 'inj-pass:dapps:tabs:v1';
  private readonly aiDrivenCategoryId = 'ai-driven';
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly redisClient: Redis;

  constructor() {
    this.bucket = process.env.SUPABASE_S3_BUCKET || 'injpass';
    this.publicBaseUrl = process.env.SUPABASE_PUBLIC_BASE_URL || '';
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    this.redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });

    this.s3Client = new S3Client({
      region: process.env.SUPABASE_S3_REGION,
      endpoint: process.env.SUPABASE_S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY || '',
      },
    });
  }

  async getPublicDapps(): Promise<StoredDApp[]> {
    return this.getStoredDapps();
  }

  async getPublicTabs(): Promise<StoredDAppTab[]> {
    return this.getStoredTabs();
  }

  async getAdminDapps(query?: string): Promise<StoredDApp[]> {
    const dapps = await this.getStoredDapps();
    const keyword = query?.trim().toLowerCase();
    if (!keyword) return dapps;

    return dapps.filter(
      (dapp) =>
        dapp.name.toLowerCase().includes(keyword) ||
        dapp.description.toLowerCase().includes(keyword) ||
        dapp.url.toLowerCase().includes(keyword) ||
        (dapp.aiPrompt ?? '').toLowerCase().includes(keyword) ||
        (dapp.aiPromptVersion ?? '').toLowerCase().includes(keyword) ||
        (dapp.mentionPrompt ?? '').toLowerCase().includes(keyword) ||
        (dapp.mentionLabel ?? '').toLowerCase().includes(keyword) ||
        (dapp.mentionThemeKey ?? '').toLowerCase().includes(keyword) ||
        (dapp.primaryCategory ?? '').toLowerCase().includes(keyword) ||
        (dapp.aiDriven ? 'ai-driven' : '').includes(keyword) ||
        (dapp.toolIds ?? []).some((toolId) =>
          toolId.toLowerCase().includes(keyword),
        ) ||
        dapp.categories.some((category) =>
          category.toLowerCase().includes(keyword),
        ),
    );
  }

  async getAdminTabs(): Promise<StoredDAppTab[]> {
    return this.getStoredTabs();
  }

  async saveTabs(tabs: StoredDAppTab[]): Promise<StoredDAppTab[]> {
    const normalized = tabs
      .map((tab, index) => ({
        id: tab.id.trim(),
        label: tab.label.trim(),
        order: Number.isFinite(tab.order) ? tab.order : index,
        enabled: Boolean(tab.enabled),
      }))
      .filter((tab) => tab.id && tab.label)
      .sort((left, right) => left.order - right.order);

    const ids = normalized.map((tab) => tab.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Tab ids must be unique.');
    }

    const dapps = await this.getStoredDapps();
    const missingCategories = Array.from(
      new Set(
        dapps
          .flatMap((dapp) => dapp.categories)
          .filter((category) => !ids.includes(category)),
      ),
    );

    if (missingCategories.length > 0) {
      throw new BadRequestException(
        `Cannot save tabs because some dapps still use missing categories: ${missingCategories.join(', ')}`,
      );
    }

    await this.redisClient.set(this.tabsCacheKey, JSON.stringify(normalized));

    return normalized;
  }

  async upsertDapp(input: UpsertDAppInput): Promise<StoredDApp> {
    const tabs = await this.getStoredTabs();
    const allowedCategories = new Set(tabs.map((tab) => tab.id));
    const categories = Array.from(
      new Set(
        (input.categories ?? [])
          .map((category) => category.trim())
          .filter(Boolean),
      ),
    );

    if (categories.length === 0) {
      throw new BadRequestException('At least one DApp category is required.');
    }

    const aiDriven = Boolean(input.aiDriven) || categories.includes(this.aiDrivenCategoryId);
    const filteredCategories = categories.filter((category) => category !== this.aiDrivenCategoryId);

    const invalidCategories = filteredCategories.filter(
      (category) => !allowedCategories.has(category),
    );
    if (invalidCategories.length > 0) {
      throw new BadRequestException(
        `DApp categories are not defined in tabs: ${invalidCategories.join(', ')}`,
      );
    }

    const normalizedPrimaryCategory = input.primaryCategory?.trim().toLowerCase();
    if (
      normalizedPrimaryCategory &&
      !filteredCategories.includes(normalizedPrimaryCategory)
    ) {
      throw new BadRequestException(
        `primaryCategory must be one of selected categories: ${filteredCategories.join(', ')}`,
      );
    }

    const normalizedToolIds = Array.from(
      new Set(
        (input.toolIds ?? [])
          .map((toolId) => toolId.trim())
          .filter(Boolean),
      ),
    ) as StoredDAppToolId[];

    const invalidToolIds = normalizedToolIds.filter(
      (toolId) => !STORED_DAPP_TOOL_IDS.includes(toolId),
    );
    if (invalidToolIds.length > 0) {
      throw new BadRequestException(
        `Unsupported toolIds: ${invalidToolIds.join(', ')}`,
      );
    }

    if (!aiDriven && normalizedToolIds.length > 0) {
      throw new BadRequestException(
        'toolIds can only be set for AI-driven dapps.',
      );
    }

    const nextToolIds = aiDriven ? normalizedToolIds : [];

    const dapps = await this.getStoredDapps();
    const now = new Date().toISOString();
    const id = input.id?.trim() || `${Date.now()}`;

    const nextDapp: StoredDApp = {
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      categories: filteredCategories,
      primaryCategory: normalizedPrimaryCategory as
        | StoredDAppPrimaryCategory
        | undefined,
      toolIds: nextToolIds,
      aiDriven,
      order:
        typeof input.order === 'number' && Number.isFinite(input.order)
          ? input.order
          : 0,
      url: input.url.trim(),
      icon: this.toPublicUrl(input.icon.trim()),
      featured: Boolean(input.featured),
      aiPrompt: this.optionalText(input.aiPrompt),
      aiPromptVersion: this.optionalText(input.aiPromptVersion),
      mentionPrompt: this.optionalText(input.mentionPrompt),
      mentionLabel: this.optionalText(input.mentionLabel),
      mentionThemeKey: this.optionalLowerText(input.mentionThemeKey),
      createdAt: now,
      updatedAt: now,
    };

    const index = dapps.findIndex((item) => item.id === id);
    if (index >= 0) {
      nextDapp.createdAt = dapps[index].createdAt;
      dapps[index] = { ...dapps[index], ...nextDapp, updatedAt: now };
    } else {
      dapps.unshift(nextDapp);
    }

    await this.saveStoredDapps(dapps);
    return index >= 0 ? dapps[index] : nextDapp;
  }

  async uploadImage(
    file: UploadedAsset,
  ): Promise<{ key: string; publicUrl: string }> {
    const extension = this.getExtension(file.originalname, file.mimetype);
    const baseName = this.getBaseName(file.originalname);
    const key = `dapp/${baseName}_${Date.now()}.${extension}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const publicUrl = this.publicBaseUrl
      ? `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`
      : key;

    return { key, publicUrl };
  }

  private async getStoredDapps(): Promise<StoredDApp[]> {
    const cached = await this.redisClient.get(this.cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as StoredDApp[];
        if (!Array.isArray(parsed)) {
          throw new Error('Invalid dapp payload');
        }

        return parsed
          .map((dapp) => this.normalizeStoredDapp(dapp))
          .sort(
            (left, right) =>
              right.order - left.order ||
              right.updatedAt.localeCompare(left.updatedAt),
          );
      } catch {
        await this.redisClient.del(this.cacheKey);
      }
    }

    return [];
  }

  private async getStoredTabs(): Promise<StoredDAppTab[]> {
    const cached = await this.redisClient.get(this.tabsCacheKey);
    if (cached) {
      try {
        return (JSON.parse(cached) as StoredDAppTab[])
          .map((tab) => this.normalizeStoredTab(tab))
          .sort((left, right) => left.order - right.order);
      } catch {
        await this.redisClient.del(this.tabsCacheKey);
      }
    }

    return [];
  }

  private async saveStoredDapps(dapps: StoredDApp[]) {
    const sorted = dapps
      .slice()
      .sort(
        (left, right) =>
          right.order - left.order ||
          right.updatedAt.localeCompare(left.updatedAt),
      );
    await this.redisClient.set(this.cacheKey, JSON.stringify(sorted));
  }

  private normalizeStoredDapp(dapp: StoredDApp): StoredDApp {
    const aiDriven =
      Boolean(dapp.aiDriven) ||
      (Array.isArray(dapp.categories) &&
        dapp.categories.includes(this.aiDrivenCategoryId));
    const normalizedToolIds = Array.isArray(dapp.toolIds)
      ? dapp.toolIds
          .map((toolId) => this.optionalText(toolId))
          .filter((toolId): toolId is StoredDAppToolId =>
            Boolean(
              toolId &&
                STORED_DAPP_TOOL_IDS.includes(toolId as StoredDAppToolId),
            ),
          )
      : [];
    const fallbackToolIds =
      normalizedToolIds.length > 0
        ? normalizedToolIds
        : this.inferToolIdsFromLegacyCapabilities(
            this.extractLegacyCapabilities(dapp),
            aiDriven,
          );

    return {
      id: String(dapp.id ?? '').trim(),
      name: String(dapp.name ?? '').trim(),
      description: String(dapp.description ?? '').trim(),
      icon: String(dapp.icon ?? '').trim(),
      categories: Array.isArray(dapp.categories)
        ? dapp.categories.filter((category): category is string => Boolean(category && category.trim()))
            .filter((category) => category !== this.aiDrivenCategoryId)
        : [],
      primaryCategory: this.optionalLowerText(dapp.primaryCategory) as
        | StoredDAppPrimaryCategory
        | undefined,
      toolIds: fallbackToolIds,
      aiDriven,
      order: Number.isFinite(dapp.order) ? dapp.order : 0,
      url: String(dapp.url ?? '').trim(),
      featured: Boolean(dapp.featured),
      aiPrompt: this.optionalText(dapp.aiPrompt),
      aiPromptVersion: this.optionalText(dapp.aiPromptVersion),
      mentionPrompt: this.optionalText(dapp.mentionPrompt),
      mentionLabel: this.optionalText(dapp.mentionLabel),
      mentionThemeKey: this.optionalLowerText(dapp.mentionThemeKey),
      createdAt: dapp.createdAt,
      updatedAt: dapp.updatedAt,
    };
  }

  private normalizeStoredTab(tab: StoredDAppTab): StoredDAppTab {
    return {
      id: String(tab.id ?? '').trim(),
      label: String(tab.label ?? '').trim(),
      order: Number.isFinite(tab.order) ? tab.order : 0,
      enabled: Boolean(tab.enabled),
    };
  }

  private getExtension(filename: string, mimeType: string) {
    const direct = filename.split('.').pop()?.toLowerCase();
    if (direct && direct.length <= 6) return direct;

    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    return 'png';
  }

  private getBaseName(filename: string) {
    const withoutExtension = filename.replace(/\.[^.]+$/, '');
    const normalized = withoutExtension
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || 'dapp';
  }

  private optionalText(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private optionalLowerText(value?: string) {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : undefined;
  }

  private toPublicUrl(icon: string) {
    if (!icon) return icon;
    if (icon.startsWith('http') || icon.startsWith('/')) return icon;
    if (!icon.startsWith('dapp/')) return icon;
    if (!this.publicBaseUrl) return icon;
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${icon.replace(/^\//, '')}`;
  }

  private inferToolIdsFromLegacyCapabilities(
    capabilities: unknown[],
    aiDriven: boolean,
  ): StoredDAppToolId[] {
    if (!aiDriven) return [];

    const bag = new Set<StoredDAppToolId>();

    for (const item of capabilities) {
      const value = String(item ?? '').trim().toLowerCase();
      if (!value) continue;

      if (value === 'read' || value === 'wallet_read') {
        bag.add('get_wallet_info');
        bag.add('get_balance');
        bag.add('get_tx_history');
      }

      if (value === 'quote' || value === 'swap' || value === 'bridge') {
        bag.add('get_swap_quote');
      }

      if (value === 'transact' || value === 'transfer' || value === 'swap' || value === 'bridge') {
        bag.add('execute_swap');
        bag.add('send_token');
      }

      if (value === 'game' || value === 'game_action') {
        bag.add('play_hash_mahjong');
        bag.add('play_hash_mahjong_multi');
      }
    }

    return STORED_DAPP_TOOL_IDS.filter((toolId) => bag.has(toolId));
  }

  private extractLegacyCapabilities(dapp: StoredDApp): unknown[] {
    const maybeLegacy = dapp as unknown as { capabilities?: unknown };
    return Array.isArray(maybeLegacy.capabilities)
      ? maybeLegacy.capabilities
      : [];
  }
}
