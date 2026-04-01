import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { ReferralLog } from './entities/referral-log.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly userService: UserService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ReferralLog)
    private readonly referralLogRepository: Repository<ReferralLog>,
    @InjectRepository(PointsTransaction)
    private readonly pointsTransactionRepository: Repository<PointsTransaction>,
  ) {}

  /**
   * Get user's invite code
   */
  async getInviteCode(credentialId: string): Promise<{ inviteCode: string } | null> {
    const user = await this.userService.getUserByCredentialId(credentialId);
    if (!user) {
      return null;
    }

    return { inviteCode: user.inviteCode };
  }

  /**
   * Validate invite code
   */
  async validateInviteCode(
    inviteCode: string,
  ): Promise<{ valid: boolean; inviterInfo?: { inviteCode: string; ninjaBalance: number } }> {
    return this.userService.validateInviteCode(inviteCode);
  }

  /**
   * Get referral stats for a user
   */
  async getStats(credentialId: string): Promise<{
    inviteCode: string;
    inviteeCount: number;
    totalRewards: number;
    invitedBy: string | null;
  }> {
    const user = await this.userService.getUserByCredentialId(credentialId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Count invitees from referral_logs
    const referralLogs = await this.referralLogRepository.find({
      where: { inviterId: user.id },
    });

    const inviteeCount = referralLogs.length;

    // Calculate total rewards from actual referral_bonus transactions
    const totalRewards = referralLogs.reduce((sum, log) => {
      return sum + Number(log.inviterReward);
    }, 0);

    return {
      inviteCode: user.inviteCode,
      inviteeCount,
      totalRewards,
      invitedBy: user.invitedBy,
    };
  }
}
