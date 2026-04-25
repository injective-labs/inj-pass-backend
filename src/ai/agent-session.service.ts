import { Injectable } from '@nestjs/common';
import { randomUUID, createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { Wallet } from 'ethers';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentSessionEntity } from './entities/agent-session.entity';

export interface AgentApiBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface AgentApiMessage {
  role: 'user' | 'assistant';
  content: string | AgentApiBlock[];
}

export interface PendingToolConfirmation {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  executionMode?: 'backend_sandbox' | 'client_wallet';
}

export interface AgentSessionRecord {
  conversationId: string;
  credentialId: string;
  walletAddress: string | null;
  title: string;
  model: string;
  sandboxMode: boolean;
  sandboxAddress?: string;
  sandboxEncryptedKey?: string;
  apiHistory: AgentApiMessage[];
  pendingConfirmation?: PendingToolConfirmation | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class AgentSessionService {
  constructor(
    @InjectRepository(AgentSessionEntity)
    private readonly agentSessionRepository: Repository<AgentSessionEntity>,
  ) {}

  async getSession(
    credentialId: string,
    conversationId: string,
  ): Promise<AgentSessionRecord | null> {
    const entity = await this.agentSessionRepository.findOne({
      where: { conversationId, credentialId },
    });

    return entity ? this.toRecord(entity) : null;
  }

  async createOrLoadSession(params: {
    credentialId: string;
    conversationId?: string;
    walletAddress: string | null;
    model: string;
    sandboxMode: boolean;
    title?: string;
  }): Promise<AgentSessionRecord> {
    const conversationId = params.conversationId ?? `conv_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const existing = await this.getSession(params.credentialId, conversationId);
    if (existing) {
      let changed = false;
      if (existing.model !== params.model) {
        existing.model = params.model;
        changed = true;
      }
      if (!existing.walletAddress && params.walletAddress) {
        existing.walletAddress = params.walletAddress;
        changed = true;
      }
      if (changed) {
        await this.saveSession(existing);
      }
      return existing;
    }

    const now = new Date().toISOString();
    const session: AgentSessionRecord = {
      conversationId,
      credentialId: params.credentialId,
      walletAddress: params.walletAddress,
      title: params.title?.trim() || 'New Chat',
      model: params.model,
      sandboxMode: params.sandboxMode,
      sandboxAddress: undefined,
      sandboxEncryptedKey: undefined,
      apiHistory: [],
      pendingConfirmation: null,
      createdAt: now,
      updatedAt: now,
    };

    if (params.sandboxMode) {
      const wallet = Wallet.createRandom();
      session.sandboxAddress = wallet.address;
      session.sandboxEncryptedKey = this.encryptPrivateKey(wallet.privateKey);
    }

    await this.saveSession(session);
    return session;
  }

  async saveSession(session: AgentSessionRecord): Promise<void> {
    const entity: Partial<AgentSessionEntity> = {
      conversationId: session.conversationId,
      credentialId: session.credentialId,
      walletAddress: session.walletAddress,
      title: session.title,
      model: session.model,
      sandboxMode: session.sandboxMode,
      sandboxAddress: session.sandboxAddress ?? null,
      sandboxEncryptedKey: session.sandboxEncryptedKey ?? null,
      apiHistory: session.apiHistory,
      pendingConfirmation: (session.pendingConfirmation as Record<string, unknown> | null) ?? null,
    };

    await this.agentSessionRepository.save(entity);
  }

  async deleteSession(conversationId: string): Promise<void> {
    await this.agentSessionRepository.delete({ conversationId });
  }

  getSandboxPrivateKey(session: AgentSessionRecord): string | null {
    if (!session.sandboxEncryptedKey) return null;
    return this.decryptPrivateKey(session.sandboxEncryptedKey);
  }

  private toRecord(entity: AgentSessionEntity): AgentSessionRecord {
    return {
      conversationId: entity.conversationId,
      credentialId: entity.credentialId,
      walletAddress: entity.walletAddress,
      title: entity.title,
      model: entity.model,
      sandboxMode: entity.sandboxMode,
      sandboxAddress: entity.sandboxAddress ?? undefined,
      sandboxEncryptedKey: entity.sandboxEncryptedKey ?? undefined,
      apiHistory: (entity.apiHistory as AgentApiMessage[]) ?? [],
      pendingConfirmation: (entity.pendingConfirmation as PendingToolConfirmation | null) ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private getMasterKeyMaterial(): Buffer {
    const secret = process.env.AGENT_WALLET_MASTER_KEY || process.env.JWT_SECRET || process.env.REDIS_URL;
    if (!secret) {
      throw new Error('AGENT_WALLET_MASTER_KEY or fallback secret must be set');
    }
    return createHash('sha256').update(secret).digest();
  }

  private encryptPrivateKey(privateKey: string): string {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = pbkdf2Sync(this.getMasterKeyMaterial(), salt, 100000, 32, 'sha256');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [salt.toString('hex'), iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
  }

  private decryptPrivateKey(encryptedData: string): string {
    const [saltHex, ivHex, tagHex, encryptedHex] = encryptedData.split(':');
    if (!saltHex || !ivHex || !tagHex || !encryptedHex) {
      throw new Error('Invalid sandbox key format');
    }
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(encryptedHex, 'hex');
    const key = pbkdf2Sync(this.getMasterKeyMaterial(), salt, 100000, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
