import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { PasskeyCredential } from '../passkey/entities/credential.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';
import { AiUsageLog } from '../points/entities/ai-usage-log.entity';
import { ChanceTransaction } from '../chance/entities/chance-transaction.entity';
import { UserService } from '../user/user.service';
import { Conversation } from '../ai/entities/conversation.entity';
import { Message } from '../ai/entities/message.entity';
import { AgentSessionEntity } from '../ai/entities/agent-session.entity';
import { AgentToolLogEntity } from '../ai/entities/agent-tool-log.entity';

type SearchUsersParams = {
  query?: string;
  page?: number;
  limit?: number;
  hasChancePurchase?: string | boolean;
  sortBy?: 'createdAt' | 'ninjaBalance' | 'aiWalletCount';
  sortDir?: 'asc' | 'desc';
};

type SearchPasskeyCredentialsParams = {
  query?: string;
  page?: number;
  limit?: number;
};

type AdminListParams = {
  page?: number;
  limit?: number;
};

type AdjustBalanceParams = {
  userId: number;
  amount: number;
  mode: 'set' | 'increment';
  reason?: string;
};

type IngestChancePurchaseParams = {
  txHash: string;
  walletAddress: string;
  productId: string;
  chanceAmount: number;
  cooldownEndsAt: number;
  chainId?: string;
  blockNumber?: number;
  logIndex?: number;
};

type UserListRow = {
  id: number;
  credentialId: string;
  inviteCode: string;
  invitedBy: string | null;
  ninjaBalance: number;
  chanceRemaining: number;
  chanceCooldownEndsAt: number;
  walletAddress: string | null;
  walletName: string | null;
  createdAt: Date;
  updatedAt: Date;
  aiWalletCount: number;
  aiRoundCount: number;
  chancePurchaseCount: number;
  latestChancePurchaseAt: Date | null;
  aiUsage: {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostNinja: number;
    lastUsedAt: Date | null;
  };
};

type AiWalletListRow = {
  sandboxAddress: string;
  sessionCount: number;
  roundCount: number;
  firstActiveAt: Date | null;
  lastActiveAt: Date | null;
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
    @InjectRepository(ChanceTransaction)
    private readonly chanceTransactionRepository: Repository<ChanceTransaction>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(AgentSessionEntity)
    private readonly agentSessionRepository: Repository<AgentSessionEntity>,
    @InjectRepository(AgentToolLogEntity)
    private readonly agentToolLogRepository: Repository<AgentToolLogEntity>,
    private readonly userService: UserService,
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

  private toOptionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return undefined;
  }

  async searchUsers(params: SearchUsersParams) {
    const page = this.clampPage(params.page);
    const limit = this.clampLimit(params.limit);
    const query = params.query?.trim();
    const hasChancePurchase = this.toOptionalBoolean(params.hasChancePurchase);
    const sortBy = params.sortBy ?? 'createdAt';
    const sortDir = params.sortDir === 'asc' ? 'ASC' : 'DESC';

    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoin(
        PasskeyCredential,
        'credential',
        'credential.credentialId = user.credentialId',
      )
      .select([
        'user.id AS "id"',
        'user.credentialId AS "credentialId"',
        'user.inviteCode AS "inviteCode"',
        'user.invitedBy AS "invitedBy"',
        'user.ninjaBalance AS "ninjaBalance"',
        'user.chanceRemaining AS "chanceRemaining"',
        'user.chanceCooldownEndsAt AS "chanceCooldownEndsAt"',
        'user.createdAt AS "createdAt"',
        'user.updatedAt AS "updatedAt"',
        'credential.walletAddress AS "walletAddress"',
        'credential.walletName AS "walletName"',
      ])
      .orderBy(
        sortBy === 'ninjaBalance' ? 'user.ninjaBalance' : 'user.createdAt',
        sortDir,
      );

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
    if (hasChancePurchase === true) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM "chance_transactions" "chance"
          WHERE "chance"."userId" = "user"."id"
        )`,
      );
    }
    if (hasChancePurchase === false) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM "chance_transactions" "chance"
          WHERE "chance"."userId" = "user"."id"
        )`,
      );
    }

    const countQb = this.userRepository
      .createQueryBuilder('user')
      .leftJoin(
        PasskeyCredential,
        'credential',
        'credential.credentialId = user.credentialId',
      );

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
    if (hasChancePurchase === true) {
      countQb.andWhere(
        `EXISTS (
          SELECT 1 FROM "chance_transactions" "chance"
          WHERE "chance"."userId" = "user"."id"
        )`,
      );
    }
    if (hasChancePurchase === false) {
      countQb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM "chance_transactions" "chance"
          WHERE "chance"."userId" = "user"."id"
        )`,
      );
    }

    if (sortBy !== 'aiWalletCount') {
      qb.skip((page - 1) * limit).take(limit);
    }

    const [rawUsers, total] = await Promise.all([qb.getRawMany(), countQb.getCount()]);

    const userIds = rawUsers
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));
    const credentialIds = rawUsers
      .map((row) => String(row.credentialId ?? '').trim())
      .filter(Boolean);
    const [aiUsageMap, chanceSummaryMap, aiWalletCountMap, aiRoundCountMap] =
      await Promise.all([
        this.getAiUsageSummaryMap(userIds),
        this.getChanceSummaryMap(userIds),
        this.getAiWalletCountByCredentialMap(credentialIds),
        this.getAiRoundCountByCredentialMap(credentialIds),
      ]);

    const users: UserListRow[] = rawUsers.map((row) => {
      const id = Number(row.id);
      return {
        id,
        credentialId: row.credentialId,
        inviteCode: row.inviteCode,
        invitedBy: row.invitedBy,
        ninjaBalance: this.normalizeNumber(row.ninjaBalance),
        chanceRemaining: this.normalizeNumber(row.chanceRemaining),
        chanceCooldownEndsAt: this.normalizeNumber(row.chanceCooldownEndsAt),
        walletAddress: row.walletAddress,
        walletName: row.walletName,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        aiWalletCount: aiWalletCountMap.get(row.credentialId) ?? 0,
        aiRoundCount: aiRoundCountMap.get(row.credentialId) ?? 0,
        chancePurchaseCount: chanceSummaryMap.get(id)?.count ?? 0,
        latestChancePurchaseAt: chanceSummaryMap.get(id)?.latest ?? null,
        aiUsage: aiUsageMap.get(id) ?? {
          totalRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCostNinja: 0,
          lastUsedAt: null,
        },
      };
    });

    if (sortBy === 'aiWalletCount') {
      const sorted = users.sort((a, b) => {
        const delta = (a.aiWalletCount ?? 0) - (b.aiWalletCount ?? 0);
        return sortDir === 'ASC' ? delta : -delta;
      });
      const start = (page - 1) * limit;
      return {
        users: sorted.slice(start, start + limit),
        total,
        page,
        limit,
      };
    }

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

    const [credential, transactions, aiLogs, aiUsage, chancePurchases, aiWallets] = await Promise.all([
      this.credentialRepository.findOne({
        where: { credentialId: user.credentialId },
      }),
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
      this.chanceTransactionRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.getAiWalletAggregates(user.credentialId),
    ]);

    return {
      user: {
        id: user.id,
        credentialId: user.credentialId,
        inviteCode: user.inviteCode,
        invitedBy: user.invitedBy,
        ninjaBalance: this.normalizeNumber(user.ninjaBalance),
        chanceRemaining: this.normalizeNumber(
          (user as User & { chanceRemaining?: number }).chanceRemaining,
        ),
        chanceCooldownEndsAt: this.normalizeNumber(
          (user as User & { chanceCooldownEndsAt?: number })
            .chanceCooldownEndsAt,
        ),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        walletAddress: credential?.walletAddress ?? null,
        walletName: credential?.walletName ?? null,
        passkeyCounter: credential
          ? this.normalizeNumber(credential.counter)
          : 0,
      },
      aiUsage: aiUsage.get(userId) ?? {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostNinja: 0,
        lastUsedAt: null,
      },
      aiLogs: aiLogs.map((log) => ({
        id: log.id,
        model: log.model,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        costNinja: this.normalizeNumber(log.costNinja),
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
      chancePurchases: chancePurchases.map((row) => ({
        id: row.id,
        txHash: row.txHash,
        productId: row.productId,
        chanceAmount: row.chanceAmount,
        status: row.status,
        createdAt: row.createdAt,
      })),
      aiWalletSummary: {
        walletCount: aiWallets.length,
        totalRounds: aiWallets.reduce((sum, item) => sum + item.roundCount, 0),
      },
    };
  }

  async getUserAiWallets(userId: number, params: AdminListParams) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    const page = this.clampPage(params.page);
    const limit = this.clampLimit(params.limit);
    const wallets = await this.getAiWalletAggregates(user.credentialId);
    const sorted = wallets.sort(
      (left, right) =>
        (right.lastActiveAt?.getTime() ?? 0) -
        (left.lastActiveAt?.getTime() ?? 0),
    );
    const total = sorted.length;
    const start = (page - 1) * limit;
    const rows = sorted.slice(start, start + limit);

    return {
      userId,
      walletAddress: user.walletAddress,
      total,
      page,
      limit,
      wallets: rows,
    };
  }

  async getUserAiWalletDetail(
    userId: number,
    walletAddress: string,
    params: AdminListParams,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    const target = walletAddress.trim().toLowerCase();
    const wallets = await this.getAiWalletAggregates(user.credentialId);
    const wallet = wallets.find(
      (row) => row.sandboxAddress.toLowerCase() === target,
    );
    if (!wallet) {
      return null;
    }

    const page = this.clampPage(params.page);
    const limit = this.clampLimit(params.limit);

    const conversationQb = this.agentSessionRepository
      .createQueryBuilder('session')
      .leftJoin(
        Conversation,
        'conversation',
        'conversation.id = session.conversationId',
      )
      .leftJoin(
        Message,
        'message',
        'message.conversationId = conversation.id AND message.role = :userRole',
        { userRole: 'user' },
      )
      .where('session.credentialId = :credentialId', {
        credentialId: user.credentialId,
      })
      .andWhere('LOWER(session.sandboxAddress) = :address', { address: target })
      .groupBy('conversation.id')
      .addGroupBy('conversation.title')
      .addGroupBy('conversation.model')
      .addGroupBy('conversation.createdAt')
      .addGroupBy('conversation.updatedAt')
      .select([
        'conversation.id AS "conversationId"',
        'conversation.title AS "title"',
        'conversation.model AS "model"',
        'conversation.createdAt AS "createdAt"',
        'conversation.updatedAt AS "updatedAt"',
        'COUNT(message.id)::int AS "roundCount"',
      ])
      .orderBy('conversation.updatedAt', 'DESC');

    const [conversationRows, toolRows] = await Promise.all([
      conversationQb.getRawMany(),
      this.agentToolLogRepository
        .createQueryBuilder('tool')
        .select(['tool.toolId AS "toolId"', 'COUNT(*)::int AS "count"'])
        .where('tool.credentialId = :credentialId', {
          credentialId: user.credentialId,
        })
        .andWhere('LOWER(tool.sandboxAddress) = :address', { address: target })
        .groupBy('tool.toolId')
        .orderBy('"count"', 'DESC')
        .getRawMany(),
    ]);

    const total = conversationRows.length;
    const start = (page - 1) * limit;
    const conversationItems = conversationRows.slice(start, start + limit);

    return {
      userId,
      wallet: {
        sandboxAddress: wallet.sandboxAddress,
        sessionCount: wallet.sessionCount,
        roundCount: wallet.roundCount,
        firstActiveAt: wallet.firstActiveAt,
        lastActiveAt: wallet.lastActiveAt,
      },
      conversations: {
        total,
        page,
        limit,
        items: conversationItems.map((row) => ({
          conversationId: row.conversationId,
          title: row.title,
          model: row.model,
          roundCount: this.normalizeNumber(row.roundCount),
          createdAt: row.createdAt ? new Date(row.createdAt) : null,
          updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
        })),
      },
      toolSummary: toolRows.map((row) => ({
        toolId: row.toolId,
        count: this.normalizeNumber(row.count),
      })),
    };
  }

  async getUserChancePurchases(userId: number, params: AdminListParams) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    const page = this.clampPage(params.page);
    const limit = this.clampLimit(params.limit);
    const [rows, total] = await this.chanceTransactionRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      userId,
      total,
      page,
      limit,
      purchases: rows.map((row) => ({
        id: row.id,
        txHash: row.txHash,
        chainId: row.chainId,
        productId: row.productId,
        chanceAmount: row.chanceAmount,
        balanceAfter: row.balanceAfter,
        status: row.status,
        metadata: row.metadata,
        createdAt: row.createdAt,
      })),
    };
  }

  async adjustUserBalance(params: AdjustBalanceParams) {
    const user = await this.userRepository.findOne({
      where: { id: params.userId },
    });
    if (!user) {
      return null;
    }

    const currentBalance = this.normalizeNumber(user.ninjaBalance);
    const amount = this.normalizeNumber(params.amount);
    const nextBalance =
      params.mode === 'set'
        ? Math.max(0, amount)
        : Math.max(0, currentBalance + amount);
    const delta = nextBalance - currentBalance;

    user.ninjaBalance = nextBalance;
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

  async ingestChancePurchase(params: IngestChancePurchaseParams) {
    const normalizedTxHash = params.txHash.trim().toLowerCase();
    const normalizedWalletAddress = params.walletAddress.trim().toLowerCase();
    const normalizedChanceAmount = Math.max(
      0,
      Math.floor(this.normalizeNumber(params.chanceAmount, 0)),
    );
    const normalizedCooldownEndsAt = Math.max(
      0,
      Math.floor(this.normalizeNumber(params.cooldownEndsAt, 0)),
    );

    let user = await this.userRepository.findOne({
      where: { walletAddress: normalizedWalletAddress },
    });

    if (!user) {
      const credential = await this.credentialRepository
        .createQueryBuilder('credential')
        .where('LOWER(credential.walletAddress) = :walletAddress', {
          walletAddress: normalizedWalletAddress,
        })
        .getOne();

      if (credential?.credentialId) {
        user = await this.userService.ensureUserExistsWithWalletAddress(
          credential.credentialId,
          normalizedWalletAddress,
        );
      }
    }

    if (!user) {
      throw new Error(
        `User not found for walletAddress: ${normalizedWalletAddress}`,
      );
    }

    return this.userRepository.manager.transaction(async (manager) => {
      const txUserRepo = manager.getRepository(User);
      const txChanceRepo = manager.getRepository(ChanceTransaction);

      const lockedUser = await txUserRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id: user.id })
        .getOne();

      if (!lockedUser) {
        throw new Error(`User disappeared during processing: ${user.id}`);
      }

      const currentChance = this.normalizeNumber(
        (lockedUser as User & { chanceRemaining?: number }).chanceRemaining,
        0,
      );
      const nextChance = Math.max(0, currentChance + normalizedChanceAmount);
      const currentCooldown = this.normalizeNumber(
        (lockedUser as User & { chanceCooldownEndsAt?: number })
          .chanceCooldownEndsAt,
        0,
      );
      const nextCooldown = Math.max(currentCooldown, normalizedCooldownEndsAt);

      const insertResult = await txChanceRepo
        .createQueryBuilder()
        .insert()
        .into(ChanceTransaction)
        .values({
          userId: lockedUser.id,
          txHash: normalizedTxHash,
          chainId: params.chainId ?? null,
          productId: params.productId,
          chanceAmount: normalizedChanceAmount,
          balanceAfter: nextChance,
          status: 'confirmed',
          metadata: {
            walletAddress: normalizedWalletAddress,
            blockNumber: params.blockNumber ?? undefined,
            logIndex: params.logIndex ?? undefined,
          },
        })
        .orIgnore()
        .returning(['id', 'txHash', 'userId'])
        .execute();

      const insertedTx = insertResult.generatedMaps[0] as
        | { id?: number; txHash?: string; userId?: number }
        | undefined;

      if (!insertedTx?.id) {
        const existing = await txChanceRepo.findOne({
          where: { txHash: normalizedTxHash },
        });
        return {
          duplicate: true,
          userId: existing?.userId ?? lockedUser.id,
          txHash: existing?.txHash ?? normalizedTxHash,
        };
      }

      (
        lockedUser as User & {
          chanceRemaining: number;
          chanceCooldownEndsAt: number;
        }
      ).chanceRemaining = nextChance;
      (
        lockedUser as User & {
          chanceRemaining: number;
          chanceCooldownEndsAt: number;
        }
      ).chanceCooldownEndsAt = nextCooldown;
      await txUserRepo.save(lockedUser);

      return {
        duplicate: false,
        userId: lockedUser.id,
        txHash: normalizedTxHash,
        chanceBalance: nextChance,
        chanceCooldownEndsAt: nextCooldown,
        chanceTransactionId: insertedTx.id,
      };
    });
  }

  private async getAiUsageSummaryMap(userIds: number[]) {
    const safeUserIds = [...new Set(userIds)].filter((id) =>
      Number.isFinite(id),
    );
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
      .addSelect('COALESCE(SUM(usage.costNinja), 0)', 'totalCostNinja')
      .addSelect('MAX(usage.createdAt)', 'lastUsedAt')
      .where('usage.userId IN (:...userIds)', { userIds: safeUserIds })
      .groupBy('usage.userId')
      .getRawMany();

    for (const row of rows) {
      empty.set(Number(row.userId), {
        totalRequests: Number(row.totalRequests) || 0,
        totalInputTokens: Number(row.totalInputTokens) || 0,
        totalOutputTokens: Number(row.totalOutputTokens) || 0,
        totalCostNinja: this.normalizeNumber(row.totalCostNinja),
        lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
      });
    }

    return empty;
  }

  private async getChanceSummaryMap(userIds: number[]) {
    const safeUserIds = [...new Set(userIds)].filter((id) =>
      Number.isFinite(id),
    );
    const map = new Map<number, { count: number; latest: Date | null }>();
    if (safeUserIds.length === 0) {
      return map;
    }

    const rows = await this.chanceTransactionRepository
      .createQueryBuilder('chance')
      .select('chance.userId', 'userId')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('MAX(chance.createdAt)', 'latest')
      .where('chance.userId IN (:...userIds)', { userIds: safeUserIds })
      .groupBy('chance.userId')
      .getRawMany();

    for (const row of rows) {
      map.set(this.normalizeNumber(row.userId), {
        count: this.normalizeNumber(row.count),
        latest: row.latest ? new Date(row.latest) : null,
      });
    }

    return map;
  }

  private async getAiWalletCountByCredentialMap(credentialIds: string[]) {
    const safeCredentialIds = [...new Set(credentialIds)].filter(Boolean);
    const map = new Map<string, number>();
    if (safeCredentialIds.length === 0) {
      return map;
    }

    const rows = await this.agentSessionRepository
      .createQueryBuilder('session')
      .select('session.credentialId', 'credentialId')
      .addSelect('COUNT(DISTINCT session.sandboxAddress)::int', 'walletCount')
      .where('session.credentialId IN (:...credentialIds)', {
        credentialIds: safeCredentialIds,
      })
      .andWhere('session.sandboxAddress IS NOT NULL')
      .groupBy('session.credentialId')
      .getRawMany();

    for (const row of rows) {
      map.set(String(row.credentialId), this.normalizeNumber(row.walletCount));
    }

    return map;
  }

  private async getAiRoundCountByCredentialMap(credentialIds: string[]) {
    const safeCredentialIds = [...new Set(credentialIds)].filter(Boolean);
    const map = new Map<string, number>();
    if (safeCredentialIds.length === 0) {
      return map;
    }

    const rows = await this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoin(
        Message,
        'message',
        'message.conversationId = conversation.id AND message.role = :userRole',
        { userRole: 'user' },
      )
      .select('conversation.credentialId', 'credentialId')
      .addSelect('COUNT(message.id)::int', 'roundCount')
      .where('conversation.credentialId IN (:...credentialIds)', {
        credentialIds: safeCredentialIds,
      })
      .groupBy('conversation.credentialId')
      .getRawMany();

    for (const row of rows) {
      map.set(String(row.credentialId), this.normalizeNumber(row.roundCount));
    }

    return map;
  }

  private async getAiWalletAggregates(
    credentialId: string,
  ): Promise<AiWalletListRow[]> {
    const rows = await this.agentSessionRepository
      .createQueryBuilder('session')
      .leftJoin(
        Conversation,
        'conversation',
        'conversation.id = session.conversationId',
      )
      .leftJoin(
        Message,
        'message',
        'message.conversationId = conversation.id AND message.role = :userRole',
        { userRole: 'user' },
      )
      .select('session.sandboxAddress', 'sandboxAddress')
      .addSelect('COUNT(DISTINCT session.conversationId)::int', 'sessionCount')
      .addSelect('COUNT(message.id)::int', 'roundCount')
      .addSelect('MIN(session.createdAt)', 'firstActiveAt')
      .addSelect('MAX(session.updatedAt)', 'lastActiveAt')
      .where('session.credentialId = :credentialId', { credentialId })
      .andWhere('session.sandboxAddress IS NOT NULL')
      .groupBy('session.sandboxAddress')
      .getRawMany();

    return rows.map((row) => ({
      sandboxAddress: String(row.sandboxAddress),
      sessionCount: this.normalizeNumber(row.sessionCount),
      roundCount: this.normalizeNumber(row.roundCount),
      firstActiveAt: row.firstActiveAt ? new Date(row.firstActiveAt) : null,
      lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt) : null,
    }));
  }
}
