import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('chance_transactions')
@Index(['txHash'], { unique: true })
export class ChanceTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 128 })
  txHash: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  chainId: string | null;

  @Column({ type: 'varchar', length: 50 })
  productId: string;

  @Column({ type: 'integer' })
  chanceAmount: number;

  @Column({ type: 'integer' })
  balanceAfter: number;

  @Column({ type: 'varchar', length: 20, default: 'confirmed' })
  status: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
