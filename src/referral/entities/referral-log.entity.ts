import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('referral_logs')
export class ReferralLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  @Index('idx_referral_logs_invite_code')
  inviteCode: string;

  @Column({ type: 'int' })
  @Index('idx_referral_logs_inviter')
  inviterId: number;

  @Column({ type: 'int' })
  @Index('idx_referral_logs_invitee')
  inviteeId: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 100 })
  inviterReward: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 50 })
  inviteeReward: number;

  @Column({ type: 'boolean', default: false })
  inviterRewardPaid: boolean;

  @Column({ type: 'boolean', default: false })
  inviteeRewardPaid: boolean;

  @Column({ type: 'int', nullable: true })
  inviterTransactionId: number | null;

  @Column({ type: 'int', nullable: true })
  inviteeTransactionId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
