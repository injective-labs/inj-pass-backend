import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentToolLogEntity } from './entities/agent-tool-log.entity';
import type { StoredDAppToolId } from '../dapps/dapps.constants';

@Injectable()
export class AgentToolLogService {
  constructor(
    @InjectRepository(AgentToolLogEntity)
    private readonly agentToolLogRepository: Repository<AgentToolLogEntity>,
  ) {}

  async createPending(input: {
    conversationId: string;
    credentialId: string;
    toolUseId?: string;
    toolId: StoredDAppToolId;
    riskLevel: string;
    inputJson?: Record<string, unknown>;
    sandboxAddress?: string | null;
    requiresConfirmation?: boolean;
  }) {
    await this.agentToolLogRepository.save({
      conversationId: input.conversationId,
      credentialId: input.credentialId,
      toolUseId: input.toolUseId ?? null,
      toolId: input.toolId,
      riskLevel: input.riskLevel,
      inputJson: input.inputJson ?? null,
      outputJson: null,
      status: input.requiresConfirmation ? 'pending_confirmation' : 'started',
      errorCode: null,
      errorMessage: null,
      txHash: null,
      sandboxAddress: input.sandboxAddress ?? null,
      requiresConfirmation: Boolean(input.requiresConfirmation),
      confirmed: input.requiresConfirmation ? null : false,
      durationMs: null,
      completedAt: null,
    });
  }

  async complete(input: {
    conversationId: string;
    toolUseId?: string;
    outputJson?: Record<string, unknown> | null;
    status: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    txHash?: string | null;
    confirmed?: boolean | null;
    durationMs?: number | null;
  }) {
    const existing = input.toolUseId
      ? await this.agentToolLogRepository.findOne({
          where: {
            conversationId: input.conversationId,
            toolUseId: input.toolUseId,
          },
          order: { id: 'DESC' },
        })
      : null;

    if (!existing) {
      return;
    }

    existing.outputJson = input.outputJson ?? null;
    existing.status = input.status;
    existing.errorCode = input.errorCode ?? null;
    existing.errorMessage = input.errorMessage ?? null;
    existing.txHash = input.txHash ?? null;
    existing.confirmed = input.confirmed ?? existing.confirmed;
    existing.durationMs = input.durationMs ?? null;
    existing.completedAt = new Date();

    await this.agentToolLogRepository.save(existing);
  }
}
