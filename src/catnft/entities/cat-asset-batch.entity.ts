import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('cat_asset_batches')
export class CatAssetBatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'metadataCid', type: 'varchar', length: 255, unique: true })
  metadataCid: string;

  @Column({ name: 'imageCid', type: 'varchar', length: 255, nullable: true })
  imageCid: string | null;

  @Column({ name: 'baseURI', type: 'varchar', length: 512 })
  baseURI: string;

  @Column({ name: 'totalItems', type: 'integer', default: 0 })
  totalItems: number;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'draft' })
  status: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
