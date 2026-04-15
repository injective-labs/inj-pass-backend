import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('agent_sessions')
export class AgentSessionEntity {
  @PrimaryColumn({ name: 'conversation_id', type: 'varchar', length: 100 })
  conversationId: string;

  @Column({ name: 'credential_id', type: 'varchar', length: 512 })
  credentialId: string;

  @Column({ name: 'wallet_address', type: 'varchar', length: 100, nullable: true })
  walletAddress: string | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 80 })
  model: string;

  @Column({ name: 'sandbox_mode', type: 'boolean', default: false })
  sandboxMode: boolean;

  @Column({ name: 'sandbox_address', type: 'varchar', length: 100, nullable: true })
  sandboxAddress: string | null;

  @Column({ name: 'sandbox_encrypted_key', type: 'text', nullable: true })
  sandboxEncryptedKey: string | null;

  @Column({ name: 'api_history', type: 'jsonb', default: () => "'[]'::jsonb" })
  apiHistory: unknown[];

  @Column({ name: 'pending_confirmation', type: 'jsonb', nullable: true })
  pendingConfirmation: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
