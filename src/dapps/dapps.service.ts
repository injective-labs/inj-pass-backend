import { BadRequestException, Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import type { StoredDApp, StoredDAppCategory, StoredDAppTab } from './dapps.constants';

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
  order?: number;
  url: string;
  featured?: boolean;
  icon: string;
};

@Injectable()
export class DappsService {
  private readonly cacheKey = 'inj-pass:dapps:directory:v1';
  private readonly tabsCacheKey = 'inj-pass:dapps:tabs:v1';
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

    return dapps.filter((dapp) =>
      dapp.name.toLowerCase().includes(keyword) ||
      dapp.description.toLowerCase().includes(keyword) ||
      dapp.url.toLowerCase().includes(keyword) ||
      dapp.categories.some((category) => category.toLowerCase().includes(keyword)),
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
        dapps.flatMap((dapp) => dapp.categories).filter((category) => !ids.includes(category)),
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

    const invalidCategories = categories.filter((category) => !allowedCategories.has(category));
    if (invalidCategories.length > 0) {
      throw new BadRequestException(
        `DApp categories are not defined in tabs: ${invalidCategories.join(', ')}`,
      );
    }

    const dapps = await this.getStoredDapps();
    const now = new Date().toISOString();
    const id = input.id?.trim() || `${Date.now()}`;

    const nextDapp: StoredDApp = {
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      categories,
      order: typeof input.order === 'number' && Number.isFinite(input.order) ? input.order : 0,
      url: input.url.trim(),
      icon: this.toPublicUrl(input.icon.trim()),
      featured: Boolean(input.featured),
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

  async uploadImage(file: UploadedAsset): Promise<{ key: string; publicUrl: string }> {
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

        for (const dapp of parsed) {
          if (!Array.isArray(dapp.categories)) {
            throw new Error('Invalid dapp categories payload');
          }
        }

        return parsed
          .map((dapp) => ({
            ...dapp,
            order: Number.isFinite(dapp.order) ? dapp.order : 0,
            categories: dapp.categories.filter(Boolean),
          }))
          .sort((left, right) => right.order - left.order || right.updatedAt.localeCompare(left.updatedAt));
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
        return (JSON.parse(cached) as StoredDAppTab[]).sort((left, right) => left.order - right.order);
      } catch {
        await this.redisClient.del(this.tabsCacheKey);
      }
    }

    return [];
  }

  private async saveStoredDapps(dapps: StoredDApp[]) {
    const sorted = dapps
      .slice()
      .sort((left, right) => right.order - left.order || right.updatedAt.localeCompare(left.updatedAt));
    await this.redisClient.set(this.cacheKey, JSON.stringify(sorted));
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

  private toPublicUrl(icon: string) {
    if (!icon) return icon;
    if (icon.startsWith('http') || icon.startsWith('/')) return icon;
    if (!icon.startsWith('dapp/')) return icon;
    if (!this.publicBaseUrl) return icon;
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${icon.replace(/^\//, '')}`;
  }
}
