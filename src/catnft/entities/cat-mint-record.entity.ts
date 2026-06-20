import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('cat_mint_records')
@Index('idx_cat_mint_tx_token', ['txHash', 'tokenId'], { unique: true })
export class CatMintRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId', type: 'integer', nullable: true })
  userId: number | null;

  @Column({ name: 'ownerAddress', type: 'varchar', length: 100 })
  ownerAddress: string;

  @Column({ name: 'tokenId', type: 'varchar', length: 128 })
  tokenId: string;

  @Column({ name: 'txHash', type: 'varchar', length: 128 })
  txHash: string;

  @Column({ name: 'contractAddress', type: 'varchar', length: 100, nullable: true })
  contractAddress: string | null;

  @Column({ name: 'metadataItemId', type: 'integer', nullable: true })
  metadataItemId: number | null;

  @Column({ name: 'source', type: 'varchar', length: 40, default: 'frontend' })
  source: string;

  @Column({ name: 'mintedAt', type: 'timestamptz', nullable: true })
  mintedAt: Date | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
