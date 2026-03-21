import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';
import { ReferralLog } from '../referral/entities/referral-log.entity';
import { POINTS_CONFIG } from '../config/points.config';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PointsTransaction)
    private readonly pointsTransactionRepository: Repository<PointsTransaction>,
    @InjectRepository(ReferralLog)
    private readonly referralLogRepository: Repository<ReferralLog>,
  ) {}

  /**
   * Generate a unique invite code
   */
  private generateInviteCode(): string {
    const { LENGTH, CHARS } = POINTS_CONFIG.INVITE_CODE;
    let code = '';
    for (let i = 0; i < LENGTH; i++) {
      code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    return code;
  }

  /**
   * Create a new user with invite code and initial NIJIA balance
   * Called when user registers via passkey
   */
  async createUser(credentialId: string, inviteCode?: string): Promise<User> {
    this.logger.log(`Creating user for credential: ${credentialId.substring(0, 8)}...`);

    // Generate unique invite code
    let newInviteCode = this.generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await this.userRepository.findOne({
        where: { inviteCode: newInviteCode },
      });
      if (!existing) break;
      newInviteCode = this.generateInviteCode();
      attempts++;
    }

    // Determine invited by
    let invitedBy: string | null = null;
    if (inviteCode) {
      // Validate invite code
      const inviter = await this.userRepository.findOne({
        where: { inviteCode },
      });
      if (inviter) {
        invitedBy = inviteCode;
        this.logger.log(`User invited by: ${inviteCode}`);
      } else {
        this.logger.warn(`Invalid invite code: ${inviteCode}`);
      }
    }

    // Create user
    const user = this.userRepository.create({
      credentialId,
      inviteCode: newInviteCode,
      invitedBy,
      ninjiaBalance: POINTS_CONFIG.INITIAL_BONUS,
    });

    const savedUser = await this.userRepository.save(user);
    this.logger.log(`User created with id: ${savedUser.id}, inviteCode: ${newInviteCode}`);

    // Record initial bonus transaction
    await this.pointsTransactionRepository.save({
      userId: savedUser.id,
      type: 'initial_bonus',
      amount: POINTS_CONFIG.INITIAL_BONUS,
      balanceAfter: POINTS_CONFIG.INITIAL_BONUS,
      metadata: { inviteCode: inviteCode || null },
    });

    // If invited, reward both inviter and invitee
    if (invitedBy) {
      const inviterTxId = await this.processReferralReward(invitedBy);
      const inviteeTxId = await this.processInviteReward(savedUser, invitedBy);

      // Record in referral_logs
      const inviter = await this.userRepository.findOne({ where: { inviteCode: invitedBy } });
      if (inviter) {
        await this.referralLogRepository.save({
          inviteCode: invitedBy,
          inviterId: inviter.id,
          inviteeId: savedUser.id,
          inviterReward: POINTS_CONFIG.REFERRAL.INVITER_REWARD,
          inviteeReward: POINTS_CONFIG.REFERRAL.INVITEE_REWARD,
          inviterRewardPaid: true,
          inviteeRewardPaid: true,
          inviterTransactionId: inviterTxId,
          inviteeTransactionId: inviteeTxId,
        });
      }
    }

    return savedUser;
  }

  /**
   * Ensure a user record exists for a credential.
   * Older passkeys may authenticate successfully before a users row was created.
   */
  async ensureUserExists(credentialId: string): Promise<User> {
    const existingUser = await this.getUserByCredentialId(credentialId);
    if (existingUser) {
      return existingUser;
    }

    this.logger.warn(`User missing for credential ${credentialId.substring(0, 8)}..., creating fallback user`);
    return this.createUser(credentialId);
  }

  /**
   * Process referral reward for the inviter
   */
  private async processReferralReward(inviteCode: string): Promise<number> {
    const inviter = await this.userRepository.findOne({
      where: { inviteCode },
    });

    if (!inviter) return 0;

    const reward = POINTS_CONFIG.REFERRAL.INVITER_REWARD;
    const newBalance = Number(inviter.ninjiaBalance) + reward;

    inviter.ninjiaBalance = newBalance;
    await this.userRepository.save(inviter);

    const transaction = await this.pointsTransactionRepository.save({
      userId: inviter.id,
      type: 'referral_bonus',
      amount: reward,
      balanceAfter: newBalance,
      metadata: { inviteCode, role: 'inviter' },
    });

    this.logger.log(`Referral reward of ${reward} NIJIA awarded to inviter ${inviteCode}`);

    return transaction.id;
  }

  /**
   * Process invite reward for the invitee
   */
  private async processInviteReward(user: User, inviteCode: string): Promise<number> {
    const reward = POINTS_CONFIG.REFERRAL.INVITEE_REWARD;
    const newBalance = Number(user.ninjiaBalance) + reward;

    user.ninjiaBalance = newBalance;
    await this.userRepository.save(user);

    const transaction = await this.pointsTransactionRepository.save({
      userId: user.id,
      type: 'referral_bonus',
      amount: reward,
      balanceAfter: newBalance,
      metadata: { inviteCode, role: 'invitee' },
    });

    this.logger.log(`Invite reward of ${reward} NIJIA awarded to invitee ${user.id}`);

    return transaction.id;
  }

  /**
   * Get user by credential ID
   */
  async getUserByCredentialId(credentialId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { credentialId },
    });
  }

  /**
   * Get user by invite code
   */
  async getUserByInviteCode(inviteCode: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { inviteCode },
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
    });
  }

  /**
   * Check if user exists by credential ID
   */
  async userExists(credentialId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });
    return !!user;
  }

  /**
   * Validate invite code
   */
  async validateInviteCode(inviteCode: string): Promise<{ valid: boolean; inviterInfo?: { inviteCode: string; ninjiaBalance: number } }> {
    const inviter = await this.userRepository.findOne({
      where: { inviteCode },
    });

    if (!inviter) {
      return { valid: false };
    }

    return {
      valid: true,
      inviterInfo: {
        inviteCode: inviter.inviteCode,
        ninjiaBalance: Number(inviter.ninjiaBalance),
      },
    };
  }

  /**
   * Get user's NIJIA balance
   */
  async getBalance(credentialId: string): Promise<number> {
    const user = await this.getUserByCredentialId(credentialId);
    return user ? Number(user.ninjiaBalance) : 0;
  }

  /**
   * Update user's NIJIA balance (deduct or add)
   * Returns the new balance
   */
  async updateBalance(
    credentialId: string,
    amount: number,
    type: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{ success: boolean; balance: number; error?: string }> {
    const user = await this.getUserByCredentialId(credentialId);
    if (!user) {
      return { success: false, balance: 0, error: 'User not found' };
    }

    const currentBalance = Number(user.ninjiaBalance);
    let newBalance = currentBalance + amount;

    // For spending (negative amount), ensure we don't go below 0
    if (newBalance < 0) {
      newBalance = 0;
    }

    user.ninjiaBalance = newBalance;
    await this.userRepository.save(user);

    // Record transaction
    await this.pointsTransactionRepository.save({
      userId: user.id,
      type,
      amount,
      balanceAfter: newBalance,
      metadata,
    });

    return { success: true, balance: newBalance };
  }
}
