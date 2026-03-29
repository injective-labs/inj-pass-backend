import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { PasskeyCredential } from '../passkey/entities/credential.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';
import { AiUsageLog } from '../points/entities/ai-usage-log.entity';

type SearchUsersParams = {
  query?: string;
  page?: number;
  limit?: number;
};

type SearchPasskeyCredentialsParams = {
  query?: string;
  page?: number;
  limit?: number;
};

type AdjustBalanceParams = {
  userId: number;
  amount: number;
  mode: 'set' | 'increment';
  reason?: string;
};

type UserListRow = {
  id: number;
  credentialId: string;
  inviteCode: string;
  invitedBy: string | null;
  ninjiaBalance: number;
  walletAddress: string | null;
  walletName: string | null;
  createdAt: Date;
  updatedAt: Date;
  aiUsage: {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostNinjia: number;
    lastUsedAt: Date | null;
  };
};

type PasskeyCredentialRow = {
  id: number;
  credentialId: string;
  userId: string | null;
  walletAddress: string | null;
  walletName: string | null;
  counter: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PasskeyCredential)
    private readonly credentialRepository: Repository<PasskeyCredential>,
    @InjectRepository(PointsTransaction)
    private readonly pointsTransactionRepository: Repository<PointsTransaction>,
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepository: Repository<AiUsageLog>,
  ) {}

  private normalizeNumber(value: unknown, fallback = 0): number {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  private clampPage(value?: number): number {
    const next = Math.floor(this.normalizeNumber(value, 1));
    return next > 0 ? next : 1;
  }

  private clampLimit(value?: number): number {
    const next = Math.floor(this.normalizeNumber(value, 20));
    if (next < 1) return 20;
    return Math.min(next, 100);
  }

  async searchUsers(params: SearchUsersParams) {
    const page = this.clampPage(params.page);
    const limit = this.clampLimit(params.limit);
    const query = params.query?.trim();

    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoin(PasskeyCredential, 'credential', 'credential.credentialId = user.credentialId')
      .select([
        'user.id AS "id"',
        'user.credentialId AS "credentialId"',
        'user.inviteCode AS "inviteCode"',
        'user.invitedBy AS "invitedBy"',
        'user.ninjiaBalance AS "ninjiaBalance"',
        'user.createdAt AS "createdAt"',
        'user.updatedAt AS "updatedAt"',
        'credential.walletAddress AS "walletAddress"',
        'credential.walletName AS "walletName"',
      ])
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query) {
      qb.where(
        `
          CAST("user"."id" AS TEXT) ILIKE :query
          OR "user"."credentialId" ILIKE :query
          OR "user"."inviteCode" ILIKE :query
          OR "user"."invitedBy" ILIKE :query
          OR "credential"."walletAddress" ILIKE :query
          OR "credential"."walletName" ILIKE :query
        `,
        { query: `%${query}%` },
      );
    }

    const countQb = this.userRepository
      .createQueryBuilder('user')
      .leftJoin(PasskeyCredential, 'credential', 'credential.credentialId = user.credentialId');

    if (query) {
      countQb.where(
        `
          CAST("user"."id" AS TEXT) ILIKE :query
          OR "user"."credentialId" ILIKE :query
          OR "user"."inviteCode" ILIKE :query
          OR "user"."invitedBy" ILIKE :query
          OR "credential"."walletAddress" ILIKE :query
          OR "credential"."walletName" ILIKE :query
        `,
        { query: `%${query}%` },
      );
    }

    const [rawUsers, total] = await Promise.all([
      qb.getRawMany(),
      countQb.getCount(),
    ]);

    const userIds = rawUsers.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
    const aiUsageMap = await this.getAiUsageSummaryMap(userIds);

    const users: UserListRow[] = rawUsers.map((row) => {
      const id = Number(row.id);
      return {
        id,
        credentialId: row.credentialId,
        inviteCode: row.inviteCode,
        invitedBy: row.invitedBy,
        ninjiaBalance: this.normalizeNumber(row.ninjiaBalance),
        walletAddress: row.walletAddress,
        walletName: row.walletName,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        aiUsage: aiUsageMap.get(id) ?? {
          totalRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCostNinjia: 0,
          lastUsedAt: null,
        },
      };
    });

    return {
      users,
      total,
      page,
      limit,
    };
  }

  async searchPasskeyCredentials(params: SearchPasskeyCredentialsParams) {
    const page = this.clampPage(params.page);
    const limit = this.clampLimit(params.limit);
    const query = params.query?.trim();

    const qb = this.credentialRepository
      .createQueryBuilder('credential')
      .select([
        'credential.id AS "id"',
        'credential.credentialId AS "credentialId"',
        'credential.userId AS "userId"',
        'credential.walletAddress AS "walletAddress"',
        'credential.walletName AS "walletName"',
        'credential.counter AS "counter"',
        'credential.createdAt AS "createdAt"',
        'credential.updatedAt AS "updatedAt"',
      ])
      .orderBy('credential.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query) {
      qb.where(
        `
          CAST("credential"."id" AS TEXT) ILIKE :query
          OR "credential"."credentialId" ILIKE :query
          OR "credential"."userId" ILIKE :query
          OR "credential"."walletAddress" ILIKE :query
          OR "credential"."walletName" ILIKE :query
        `,
        { query: `%${query}%` },
      );
    }

    const countQb = this.credentialRepository.createQueryBuilder('credential');

    if (query) {
      countQb.where(
        `
          CAST("credential"."id" AS TEXT) ILIKE :query
          OR "credential"."credentialId" ILIKE :query
          OR "credential"."userId" ILIKE :query
          OR "credential"."walletAddress" ILIKE :query
          OR "credential"."walletName" ILIKE :query
        `,
        { query: `%${query}%` },
      );
    }

    const [rows, total] = await Promise.all([
      qb.getRawMany(),
      countQb.getCount(),
    ]);

    const credentials: PasskeyCredentialRow[] = rows.map((row) => ({
      id: Number(row.id),
      credentialId: row.credentialId,
      userId: row.userId,
      walletAddress: row.walletAddress,
      walletName: row.walletName,
      counter: this.normalizeNumber(row.counter),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));

    return {
      credentials,
      total,
      page,
      limit,
    };
  }

  async getUserDetail(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    const [credential, transactions, aiLogs, aiUsage] = await Promise.all([
      this.credentialRepository.findOne({ where: { credentialId: user.credentialId } }),
      this.pointsTransactionRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.aiUsageLogRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.getAiUsageSummaryMap([userId]),
    ]);

    return {
      user: {
        id: user.id,
        credentialId: user.credentialId,
        inviteCode: user.inviteCode,
        invitedBy: user.invitedBy,
        ninjiaBalance: this.normalizeNumber(user.ninjiaBalance),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        walletAddress: credential?.walletAddress ?? null,
        walletName: credential?.walletName ?? null,
      },
      aiUsage: aiUsage.get(userId) ?? {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostNinjia: 0,
        lastUsedAt: null,
      },
      aiLogs: aiLogs.map((log) => ({
        id: log.id,
        model: log.model,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        costNinjia: this.normalizeNumber(log.costNinjia),
        conversationId: log.conversationId,
        createdAt: log.createdAt,
      })),
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: this.normalizeNumber(tx.amount),
        balanceAfter: this.normalizeNumber(tx.balanceAfter),
        metadata: tx.metadata,
        createdAt: tx.createdAt,
      })),
    };
  }

  async adjustUserBalance(params: AdjustBalanceParams) {
    const user = await this.userRepository.findOne({ where: { id: params.userId } });
    if (!user) {
      return null;
    }

    const currentBalance = this.normalizeNumber(user.ninjiaBalance);
    const amount = this.normalizeNumber(params.amount);
    const nextBalance = params.mode === 'set'
      ? Math.max(0, amount)
      : Math.max(0, currentBalance + amount);
    const delta = nextBalance - currentBalance;

    user.ninjiaBalance = nextBalance;
    await this.userRepository.save(user);

    const transaction = await this.pointsTransactionRepository.save({
      userId: user.id,
      type: 'admin_adjustment',
      amount: delta,
      balanceAfter: nextBalance,
      metadata: {
        reason: params.reason?.trim() || null,
        mode: params.mode,
        requestedAmount: amount,
      },
    });

    return {
      userId: user.id,
      previousBalance: currentBalance,
      currentBalance: nextBalance,
      delta,
      transactionId: transaction.id,
    };
  }

  private async getAiUsageSummaryMap(userIds: number[]) {
    const safeUserIds = [...new Set(userIds)].filter((id) => Number.isFinite(id));
    const empty = new Map<number, UserListRow['aiUsage']>();
    if (safeUserIds.length === 0) {
      return empty;
    }

    const rows = await this.aiUsageLogRepository
      .createQueryBuilder('usage')
      .select('usage.userId', 'userId')
      .addSelect('COUNT(*)', 'totalRequests')
      .addSelect('COALESCE(SUM(usage.inputTokens), 0)', 'totalInputTokens')
      .addSelect('COALESCE(SUM(usage.outputTokens), 0)', 'totalOutputTokens')
      .addSelect('COALESCE(SUM(usage.costNinjia), 0)', 'totalCostNinjia')
      .addSelect('MAX(usage.createdAt)', 'lastUsedAt')
      .where('usage.userId IN (:...userIds)', { userIds: safeUserIds })
      .groupBy('usage.userId')
      .getRawMany();

    for (const row of rows) {
      empty.set(Number(row.userId), {
        totalRequests: Number(row.totalRequests) || 0,
        totalInputTokens: Number(row.totalInputTokens) || 0,
        totalOutputTokens: Number(row.totalOutputTokens) || 0,
        totalCostNinjia: this.normalizeNumber(row.totalCostNinjia),
        lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
      });
    }

    return empty;
  }
}
