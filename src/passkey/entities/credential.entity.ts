import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('passkey_credentials')
export class PasskeyCredential {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 512, unique: true })
  @Index()
  credentialId: string;

  @Column({ type: 'bytea' })
  publicKey: Buffer;

  @Column({ type: 'bigint', default: 0 })
  counter: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  userId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
