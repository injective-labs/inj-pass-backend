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

  @Column({ type: 'integer' })
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  model: string;

  @Column({ type: 'integer' })
  inputTokens: number;

  @Column({ type: 'integer' })
  outputTokens: number;

  @Column({ type: 'decimal', precision: 20, scale: 4 })
  costNinjia: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  conversationId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
