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

  @Column({ type: 'varchar', length: 512, unique: true })
  @JoinColumn({ name: 'credential_id' })
  credentialId: string;

  @OneToOne(() => PasskeyCredential)
  @JoinColumn({ name: 'credential_id', referencedColumnName: 'credentialId' })
  credential: PasskeyCredential;

  @Column({ type: 'varchar', length: 20, unique: true })
  inviteCode: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  invitedBy: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 22.0 })
  ninjiaBalance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
