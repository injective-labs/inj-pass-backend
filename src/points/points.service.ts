import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { PointsTransaction } from './entities/points-transaction.entity';
import { POINTS_CONFIG } from '../config/points.config';
import { UserService } from '../user/user.service';

@Injectable()
export class PointsService {
  private readonly logger = new Logger(PointsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PointsTransaction)
    private readonly pointsTransactionRepository: Repository<PointsTransaction>,
    private readonly userService: UserService,
  ) {}

  /**
   * Sync NIJIA balance from tap game
   * Called when user completes a tap game session
   */
  async syncNinjia(
    credentialId: string,
    earnedNinjia: number,
  ): Promise<{ balance: number; transactionId: number }> {
    const safeEarnedNinjia = Number(earnedNinjia);
    if (!Number.isFinite(safeEarnedNinjia) || safeEarnedNinjia <= 0) {
      throw new Error('Invalid earnedNinjia');
    }

    this.logger.log(`Syncing ${safeEarnedNinjia} NIJIA for user: ${credentialId.substring(0, 8)}...`);

    const user = await this.userService.ensureUserExists(credentialId);

    const currentBalance = Number(user.ninjiaBalance);
    const safeCurrentBalance = Number.isFinite(currentBalance) ? currentBalance : 0;
    const newBalance = safeCurrentBalance + safeEarnedNinjia;

    // Update user balance
    user.ninjiaBalance = newBalance;
    await this.userRepository.save(user);

    // Record transaction
    const transaction = await this.pointsTransactionRepository.save({
      userId: user.id,
      type: 'tap_game',
      amount: safeEarnedNinjia,
      balanceAfter: newBalance,
      metadata: {},
    });

    return {
      balance: newBalance,
      transactionId: transaction.id,
    };
  }

  /**
   * Get user's NIJIA balance
   */
  async getBalance(credentialId: string): Promise<{ balance: number }> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return { balance: 0 };
    }

    const rawBalance = Number(user.ninjiaBalance);
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

  /**
   * Deduct NIJIA for AI usage (called by AI service)
   */
  async deductForAi(
    credentialId: string,
    costNinjia: number,
    conversationId?: string,
  ): Promise<{ success: boolean; balance: number; error?: string }> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return { success: false, balance: 0, error: 'User not found' };
    }

    const currentBalance = Number(user.ninjiaBalance);
    let newBalance = currentBalance - costNinjia;

    // If balance would go negative, set to 0
    if (newBalance < 0) {
      newBalance = 0;
    }

    // Calculate actual cost (may be less than requested if balance insufficient)
    const actualCost = currentBalance - newBalance;

    user.ninjiaBalance = newBalance;
    await this.userRepository.save(user);

    // Record transaction
    await this.pointsTransactionRepository.save({
      userId: user.id,
      type: 'ai_spent',
      amount: -actualCost,
      balanceAfter: newBalance,
      metadata: { conversationId, requestedCost: costNinjia },
    });

    return {
      success: true,
      balance: newBalance,
    };
  }
}
