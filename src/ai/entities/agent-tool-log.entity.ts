import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('agent_tool_logs')
export class AgentToolLogEntity {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'conversation_id', type: 'varchar', length: 100 })
  conversationId: string;

  @Column({ name: 'credential_id', type: 'varchar', length: 512 })
  credentialId: string;

  @Column({ name: 'tool_use_id', type: 'varchar', length: 120, nullable: true })
  toolUseId: string | null;

  @Column({ name: 'tool_id', type: 'varchar', length: 100 })
  toolId: string;

  @Column({ name: 'risk_level', type: 'varchar', length: 40 })
  riskLevel: string;

  @Column({ name: 'input_json', type: 'jsonb', nullable: true })
  inputJson: Record<string, unknown> | null;

  @Column({ name: 'output_json', type: 'jsonb', nullable: true })
  outputJson: Record<string, unknown> | null;

  @Column({ name: 'status', type: 'varchar', length: 40 })
  status: string;

  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 100, nullable: true })
  txHash: string | null;

  @Column({ name: 'sandbox_address', type: 'varchar', length: 100, nullable: true })
  sandboxAddress: string | null;

  @Column({ name: 'requires_confirmation', type: 'boolean', default: false })
  requiresConfirmation: boolean;

  @Column({ name: 'confirmed', type: 'boolean', nullable: true })
  confirmed: boolean | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
