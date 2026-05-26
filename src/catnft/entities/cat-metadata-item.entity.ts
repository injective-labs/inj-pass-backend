import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('cat_metadata_items')
@Index('idx_cat_metadata_batch_serial', ['batchId', 'serialNo'], { unique: true })
export class CatMetadataItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'batchId', type: 'integer' })
  batchId: number;

  @Column({ name: 'serialNo', type: 'integer' })
  serialNo: number;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'image', type: 'varchar', length: 1024, nullable: true })
  image: string | null;

  @Column({ name: 'attributes', type: 'jsonb', nullable: true })
  attributes: Array<Record<string, unknown>> | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ready' })
  status: string;

  @Column({ name: 'minted', type: 'boolean', default: false })
  minted: boolean;

  @Column({ name: 'mintedTokenId', type: 'varchar', length: 128, nullable: true })
  mintedTokenId: string | null;

  @Column({ name: 'mintedTxHash', type: 'varchar', length: 128, nullable: true })
  mintedTxHash: string | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
