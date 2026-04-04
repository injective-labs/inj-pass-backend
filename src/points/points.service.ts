import { Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { PointsTransaction } from './entities/points-transaction.entity';
import { POINTS_CONFIG } from '../config/points.config';
import { UserService } from '../user/user.service';

export interface NinjaMinerState {
  ninjaBalance: number;
  chanceRemaining: number;
  tapCooldownEndsAt: number;
  chanceCooldownEndsAt: number;
  sessionStartedAt: number;
  sessionEndsAt: number;
  sessionEarned: number;
  cooldownEndsAt?: number;
}

@Injectable()
export class PointsService {
  private readonly logger = new Logger(PointsService.name);
  private readonly ninjaMinerStateTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PointsTransaction)
    private readonly pointsTransactionRepository: Repository<PointsTransaction>,
    private readonly userService: UserService,
  ) {}

  private normalizeWalletAddress(walletAddress?: string): string {
    const normalized = String(walletAddress ?? 'default').trim().toLowerCase();
    return normalized.length > 0 ? normalized.slice(0, 128) : 'default';
  }

  private getNinjaMinerStateKey(credentialId: string, walletAddress?: string): string {
    return `inj-pass:ninja-miner:${credentialId}:${this.normalizeWalletAddress(walletAddress)}`;
  }

  private sanitizeNinjaMinerState(state: Partial<NinjaMinerState>): NinjaMinerState {
    const toFiniteNumber = (value: unknown, fallback = 0): number => {
      const next = Number(value);
      return Number.isFinite(next) ? next : fallback;
    };

    const legacyCooldownEndsAt = typeof state.cooldownEndsAt !== 'undefined'
      ? state.cooldownEndsAt
      : undefined;
    const tapCooldownEndsAt = typeof state.tapCooldownEndsAt !== 'undefined'
      ? state.tapCooldownEndsAt
      : legacyCooldownEndsAt;

    return {
      ninjaBalance: Math.max(0, toFiniteNumber(state.ninjaBalance, 0)),
      chanceRemaining: Math.max(0, Math.floor(toFiniteNumber(state.chanceRemaining, 0))),
      tapCooldownEndsAt: Math.max(0, Math.floor(toFiniteNumber(tapCooldownEndsAt, 0))),
      chanceCooldownEndsAt: Math.max(0, Math.floor(toFiniteNumber(state.chanceCooldownEndsAt, 0))),
      sessionStartedAt: Math.max(0, Math.floor(toFiniteNumber(state.sessionStartedAt, 0))),
      sessionEndsAt: Math.max(0, Math.floor(toFiniteNumber(state.sessionEndsAt, 0))),
      sessionEarned: Math.max(0, toFiniteNumber(state.sessionEarned, 0)),
    };
  }

  async getNinjaMinerState(
    credentialId: string,
    walletAddress?: string,
  ): Promise<NinjaMinerState | null> {
    const key = this.getNinjaMinerStateKey(credentialId, walletAddress);
    const cached = await this.cacheManager.get<string>(key);

    if (!cached) {
      return null;
    }

    try {
      const parsed = JSON.parse(cached) as Partial<NinjaMinerState>;
      return this.sanitizeNinjaMinerState(parsed);
    } catch {
      await this.cacheManager.del(key);
      return null;
    }
  }

  async saveNinjaMinerState(
    credentialId: string,
    walletAddress: string,
    state: NinjaMinerState,
  ): Promise<NinjaMinerState> {
    const key = this.getNinjaMinerStateKey(credentialId, walletAddress);
    const safeState = this.sanitizeNinjaMinerState(state);

    await this.cacheManager.set(
      key,
      JSON.stringify(safeState),
      this.ninjaMinerStateTtlMs,
    );

    return safeState;
  }

  /**
   * Sync NINJA balance from tap game
   * Called when user completes a tap game session
   */
  async syncNinja(
    credentialId: string,
    earnedNinja: number,
    options?: { consumeChance?: boolean; chanceCooldownSeconds?: number },
  ): Promise<{ balance: number; transactionId: number; chanceRemaining?: number; chanceCooldownEndsAt?: number }> {
    const safeEarnedNinja = Number(earnedNinja);
    if (!Number.isFinite(safeEarnedNinja) || safeEarnedNinja <= 0) {
      throw new Error('Invalid earnedNinja');
    }

    this.logger.log(`Syncing ${safeEarnedNinja} NINJA for user: ${credentialId.substring(0, 8)}...`);
    const consumeChance = Boolean(options?.consumeChance);
    const safeChanceCooldownSeconds = Math.max(1, Math.floor(Number(options?.chanceCooldownSeconds) || 20));

    await this.userService.ensureUserExists(credentialId);

    return this.userRepository.manager.transaction(async (manager) => {
      const txUserRepo = manager.getRepository(User);
      const txPointsRepo = manager.getRepository(PointsTransaction);

      const user = await txUserRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.credentialId = :credentialId', { credentialId })
        .getOne();

      if (!user) {
        throw new Error('User not found');
      }

      const now = Date.now();
      const currentBalance = Number(user.ninjaBalance);
      const safeCurrentBalance = Number.isFinite(currentBalance) ? currentBalance : 0;

      let nextChanceRemaining = Math.max(0, Math.floor(Number((user as User & { chanceRemaining?: number }).chanceRemaining) || 0));
      let nextChanceCooldownEndsAt = Math.max(0, Math.floor(Number((user as User & { chanceCooldownEndsAt?: number }).chanceCooldownEndsAt) || 0));

      if (consumeChance) {
        if (nextChanceRemaining <= 0) {
          throw new Error('No chance left');
        }

        if (nextChanceCooldownEndsAt > now) {
          throw new Error('Chance cooldown active');
        }

        nextChanceRemaining -= 1;
        nextChanceCooldownEndsAt = now + safeChanceCooldownSeconds * 1000;
      }

      const newBalance = safeCurrentBalance + safeEarnedNinja;
      user.ninjaBalance = newBalance;
      if (consumeChance) {
        (user as User & { chanceRemaining: number; chanceCooldownEndsAt: number }).chanceRemaining = nextChanceRemaining;
        (user as User & { chanceRemaining: number; chanceCooldownEndsAt: number }).chanceCooldownEndsAt = nextChanceCooldownEndsAt;
      }

      await txUserRepo.save(user);

      const transaction = await txPointsRepo.save({
        userId: user.id,
        type: 'tap_game',
        amount: safeEarnedNinja,
        balanceAfter: newBalance,
        metadata: {
          consumeChance,
        },
      });

      return {
        balance: newBalance,
        transactionId: transaction.id,
        chanceRemaining: nextChanceRemaining,
        chanceCooldownEndsAt: nextChanceCooldownEndsAt,
      };
    });
  }

  /**
   * Get user's NINJA balance
   */
  async getBalance(credentialId: string): Promise<{ balance: number }> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return { balance: 0 };
    }

    const rawBalance = Number(user.ninjaBalance);
    const safeBalance = Number.isFinite(rawBalance) ? rawBalance : 0;

    return {
      balance: safeBalance,
    };
  }

  /**
   * Get user's transaction history
   */
  async getTransactions(
    credentialId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ transactions: PointsTransaction[]; total: number }> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return { transactions: [], total: 0 };
    }

    const [transactions, total] = await this.pointsTransactionRepository.findAndCount({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { transactions, total };
  }

  async consumeChance(
    credentialId: string,
    cooldownSeconds = 20,
  ): Promise<{ success: boolean; chanceRemaining?: number; chanceCooldownEndsAt?: number; error?: string }> {
    const safeCooldownSeconds = Math.max(1, Math.floor(Number(cooldownSeconds) || 20));
    const now = Date.now();

    return this.userRepository.manager.transaction(async (manager) => {
      const txUserRepo = manager.getRepository(User);
      const user = await txUserRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.credentialId = :credentialId', { credentialId })
        .getOne();

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const currentChance = Math.max(0, Math.floor(Number((user as User & { chanceRemaining?: number }).chanceRemaining) || 0));
      const currentCooldownEndsAt = Math.max(0, Math.floor(Number((user as User & { chanceCooldownEndsAt?: number }).chanceCooldownEndsAt) || 0));

      if (currentChance <= 0) {
        return {
          success: false,
          error: 'No chance left',
          chanceRemaining: 0,
          chanceCooldownEndsAt: currentCooldownEndsAt,
        };
      }

      if (currentCooldownEndsAt > now) {
        return {
          success: false,
          error: 'Chance cooldown active',
          chanceRemaining: currentChance,
          chanceCooldownEndsAt: currentCooldownEndsAt,
        };
      }

      const nextChance = currentChance - 1;
      const nextCooldownEndsAt = now + safeCooldownSeconds * 1000;

      (user as User & { chanceRemaining: number; chanceCooldownEndsAt: number }).chanceRemaining = nextChance;
      (user as User & { chanceRemaining: number; chanceCooldownEndsAt: number }).chanceCooldownEndsAt = nextCooldownEndsAt;
      await txUserRepo.save(user);

      return {
        success: true,
        chanceRemaining: nextChance,
        chanceCooldownEndsAt: nextCooldownEndsAt,
      };
    });
  }

  /**
   * Deduct NINJA for AI usage (called by AI service)
   */
  async deductForAi(
    credentialId: string,
    costNinja: number,
    conversationId?: string,
  ): Promise<{ success: boolean; balance: number; error?: string }> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return { success: false, balance: 0, error: 'User not found' };
    }

    const currentBalance = Number(user.ninjaBalance);
    let newBalance = currentBalance - costNinja;

    // If balance would go negative, set to 0
    if (newBalance < 0) {
      newBalance = 0;
    }

    // Calculate actual cost (may be less than requested if balance insufficient)
    const actualCost = currentBalance - newBalance;

    user.ninjaBalance = newBalance;
    await this.userRepository.save(user);

    // Record transaction
    await this.pointsTransactionRepository.save({
      userId: user.id,
      type: 'ai_spent',
      amount: -actualCost,
      balanceAfter: newBalance,
      metadata: { conversationId, requestedCost: costNinja },
    });

    return {
      success: true,
      balance: newBalance,
    };
  }
}
