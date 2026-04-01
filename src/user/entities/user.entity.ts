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

  @Column({ name: 'ninjaBalance', type: 'decimal', precision: 20, scale: 2, default: 22.0 })
  ninjaBalance: number;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
