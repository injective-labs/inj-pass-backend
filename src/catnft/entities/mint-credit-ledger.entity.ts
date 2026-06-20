import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('mint_credit_ledger')
export class MintCreditLedger {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId', type: 'integer' })
  userId: number;

  @Column({ name: 'delta', type: 'integer' })
  delta: number;

  @Column({ name: 'balanceAfter', type: 'integer' })
  balanceAfter: number;

  @Column({ name: 'source', type: 'varchar', length: 64 })
  source: string;

  @Column({ name: 'sourceRef', type: 'varchar', length: 255, nullable: true })
  sourceRef: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
