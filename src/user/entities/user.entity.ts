import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { PasskeyCredential } from '../../passkey/entities/credential.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'credentialId', type: 'varchar', length: 512, unique: true })
  credentialId: string;

  @OneToOne(() => PasskeyCredential)
  @JoinColumn({ name: 'credentialId', referencedColumnName: 'credentialId' })
  credential: PasskeyCredential;

  @Column({ name: 'inviteCode', type: 'varchar', length: 20, unique: true })
  inviteCode: string;

  @Column({ name: 'invitedBy', type: 'varchar', length: 20, nullable: true })
  invitedBy: string | null;

  @Column({ name: 'ninjaBalance', type: 'decimal', precision: 20, scale: 2, default: 0 })
  ninjaBalance: number;

  @Column({ name: 'chanceRemaining', type: 'integer', default: 0 })
  chanceRemaining: number;

  @Column({ name: 'chanceCooldownEndsAt', type: 'bigint', default: 0 })
  chanceCooldownEndsAt: number;

  @Column({ name: 'walletAddress', type: 'varchar', length: 100, unique: true, nullable: true })
  walletAddress: string | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
