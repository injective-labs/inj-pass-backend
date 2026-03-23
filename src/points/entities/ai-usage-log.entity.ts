import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('ai_usage_logs')
export class AiUsageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId', type: 'integer' })
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  model: string;

  @Column({ name: 'inputTokens', type: 'integer' })
  inputTokens: number;

  @Column({ name: 'outputTokens', type: 'integer' })
  outputTokens: number;

  @Column({ name: 'costNinjia', type: 'decimal', precision: 20, scale: 4 })
  costNinjia: number;

  @Column({ name: 'conversationId', type: 'varchar', length: 100, nullable: true })
  conversationId: string | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
