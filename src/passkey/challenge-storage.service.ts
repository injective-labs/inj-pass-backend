import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PasskeyCredential } from './entities/credential.entity';

interface StoredChallenge {
  challenge: string;
  action: 'register' | 'authenticate';
  userId?: string;
  createdAt: number;
  expiresAt: number;
}

interface StoredCredential {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  createdAt: number;
  walletAddress?: string;
  walletName?: string;
}

@Injectable()
export class ChallengeStorageService {
  constructor(
    @InjectRepository(PasskeyCredential)
    private readonly credentialRepository: Repository<PasskeyCredential>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Store a challenge with TTL (Redis)
   */
  async store(challenge: string, action: 'register' | 'authenticate', userId?: string): Promise<void> {
    const now = Date.now();
    const expiresAt = now + 60000; // 60 seconds TTL

    const data: StoredChallenge = {
      challenge,
      action,
      userId,
      createdAt: now,
      expiresAt,
    };

    // Store in Redis with 60s TTL
    await this.cacheManager.set(`challenge:${challenge}`, JSON.stringify(data), 60000);
  }

  /**
   * Get and validate a challenge (Redis)
   */
  async get(challenge: string): Promise<StoredChallenge | null> {
    const stored = await this.cacheManager.get<string>(`challenge:${challenge}`);
    
    if (!stored) {
      return null;
    }

    const data: StoredChallenge = JSON.parse(stored);

    // Check if expired (Redis TTL should handle this, but double-check)
    if (Date.now() > data.expiresAt) {
      await this.delete(challenge);
      return null;
    }

    return data;
  }

  /**
   * Delete a challenge (Redis)
   */
  async delete(challenge: string): Promise<void> {
    await this.cacheManager.del(`challenge:${challenge}`);
  }

  /**
   * Get storage stats (for debugging)
   */
  async getStats(): Promise<{ total: number; expired: number }> {
    // Redis doesn't easily support counting keys, return placeholder
    return {
      total: 0,
      expired: 0,
    };
  }

  /**
   * Generate unique wallet name by checking for duplicates
   */
  async generateUniqueWalletName(walletName: string): Promise<string> {
    if (!walletName) {
      return walletName;
    }

    // Count existing wallets with the same name
    const count = await this.credentialRepository.count({
      where: { walletName },
    });

    if (count === 0) {
      return walletName;
    }

    // Find the next available number
    let suffix = 1;
    let candidateName = `${walletName}_${suffix}`;
    
    while (await this.credentialRepository.count({ where: { walletName: candidateName } }) > 0) {
      suffix++;
      candidateName = `${walletName}_${suffix}`;
    }

    return candidateName;
  }

  /**
   * Store credential (PostgreSQL)
   */
  async storeCredential(credentialId: string, publicKey: Uint8Array, counter: number, walletAddress?: string, walletName?: string): Promise<string> {
    // Generate unique wallet name if provided
    const uniqueWalletName = walletName ? await this.generateUniqueWalletName(walletName) : null;

    const credential = this.credentialRepository.create({
      credentialId,
      publicKey: Buffer.from(publicKey),
      counter,
      userId: null, // Optional: can be used for multi-user scenarios
      walletAddress: walletAddress || null,
      walletName: uniqueWalletName,
    });

    await this.credentialRepository.save(credential);
    
    return uniqueWalletName || walletName || '';
  }

  /**
   * Get stored credential (PostgreSQL)
   */
  async getCredential(credentialId: string): Promise<StoredCredential | null> {
    const credential = await this.credentialRepository.findOne({
      where: { credentialId },
    });

    if (!credential) {
      return null;
    }

    return {
      credentialId: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: Number(credential.counter),
      createdAt: credential.createdAt.getTime(),
      walletAddress: credential.walletAddress || undefined,
      walletName: credential.walletName || undefined,
    };
  }

  /**
   * Update credential counter (PostgreSQL)
   */
  async updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
    await this.credentialRepository.update(
      { credentialId },
      { counter },
    );
  }

  /**
   * Get credential stats (PostgreSQL)
   */
  async getCredentialStats(): Promise<{ total: number }> {
    const count = await this.credentialRepository.count();
    return { total: count };
  }
}
