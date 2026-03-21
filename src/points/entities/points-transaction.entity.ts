import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('points_transactions')
export class PointsTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  type: string; // 'tap_game', 'referral_bonus', 'ai_spent'

  @Column({ type: 'decimal', precision: 20, scale: 4 })
  amount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  balanceAfter: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
