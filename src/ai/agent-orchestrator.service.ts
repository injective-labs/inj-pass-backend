import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { UserService } from '../user/user.service';
import { AIService } from './ai.service';
import { AgentsService } from './agents/agents.service';
import { DappsService } from '../dapps/dapps.service';
import {
  STORED_TOOL_DEFINITIONS,
  type StoredDApp,
  type StoredDAppToolId,
} from '../dapps/dapps.constants';
import {
  AgentApiBlock,
  AgentApiMessage,
  AgentSessionRecord,
  AgentSessionService,
  PendingToolConfirmation,
} from './agent-session.service';
import { PromptBuilderService } from './prompt-builder.service';
import { AgentToolLogService } from './agent-tool-log.service';
import { SandboxWalletService } from './sandbox-wallet.service';
import {
  getAgentApiKey,
  getAgentBaseUrl,
  getDefaultAgentModel,
} from './ai-runtime.config';

const DEFAULT_MODEL = getDefaultAgentModel();
const DESTRUCTIVE_TOOLS = new Set<StoredDAppToolId>([
  'execute_swap',
  'send_token',
  'play_hash_mahjong',
  'play_hash_mahjong_multi',
]);
const BASE_TOOL_IDS: StoredDAppToolId[] = [
  'get_wallet_info',
  'get_balance',
  'get_swap_quote',
  'execute_swap',
  'send_token',
  'get_tx_history',
];

type AgentUiMessage = {
  role: 'assistant' | 'tool';
  content: string;
  isError?: boolean;
};

@Injectable()
export class AgentOrchestratorService {
  private readonly anthropic = new Anthropic({
    apiKey: getAgentApiKey(),
    baseURL: getAgentBaseUrl(),
  });

  constructor(
    private readonly aiService: AIService,
    private readonly userService: UserService,
    private readonly agentsService: AgentsService,
    private readonly dappsService: DappsService,
    private readonly agentSessionService: AgentSessionService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly agentToolLogService: AgentToolLogService,
    private readonly sandboxWalletService: SandboxWalletService,
  ) {}

  async chat(
    credentialId: string,
    input: {
      conversationId?: string;
      message: string;
      model?: string;
      sandboxMode?: boolean;
    },
  ) {
    const user = await this.userService.ensureUserExistsWithWalletAddress(credentialId);
    const trimmedMessage = input.message.trim();
    if (!trimmedMessage) {
      return {
        ok: false,
        error: 'Message is required',
      };
    }

    const session = await this.agentSessionService.createOrLoadSession({
      credentialId,
      conversationId: input.conversationId,
      walletAddress: user.walletAddress,
      model: input.model?.trim() || DEFAULT_MODEL,
      sandboxMode: input.sandboxMode ?? true,
      title: trimmedMessage.slice(0, 40),
    });

    if (session.pendingConfirmation) {
      this.appendCancelledPendingToolResult(
        session,
        session.pendingConfirmation,
        'Pending confirmation cancelled because user sent a new message.',
      );
      await this.agentToolLogService.complete({
        conversationId: session.conversationId,
        toolUseId: session.pendingConfirmation.toolUseId,
        status: 'cancelled',
        confirmed: false,
        errorCode: 'PENDING_CONFIRMATION_CANCELLED',
        errorMessage:
          'Pending confirmation cancelled because user sent a new message.',
      });
    }

    session.title = session.apiHistory.length === 0 ? trimmedMessage.slice(0, 40) || session.title : session.title;
    session.apiHistory.push({ role: 'user', content: trimmedMessage });
    session.pendingConfirmation = null;
    await this.agentSessionService.saveSession(session);

    return this.continueLoop(session, []);
  }

  async confirm(
    credentialId: string,
    input: { conversationId: string; approve: boolean },
  ) {
    const session = await this.agentSessionService.getSession(
      credentialId,
      input.conversationId,
    );

    if (!session) {
      return { ok: false, error: 'Conversation not found' };
    }

    const pending = session.pendingConfirmation;
    if (!pending) {
      return { ok: false, error: 'No pending confirmation found' };
    }

    if (!input.approve) {
      this.appendCancelledPendingToolResult(
        session,
        pending,
        'User cancelled the pending tool action.',
      );
      session.pendingConfirmation = null;
      await this.agentToolLogService.complete({
        conversationId: session.conversationId,
        toolUseId: pending.toolUseId,
        status: 'cancelled',
        confirmed: false,
        errorMessage: 'User cancelled the pending tool action.',
      });
      session.apiHistory.push({
        role: 'assistant',
        content: 'Operation cancelled.',
      });
      await this.agentSessionService.saveSession(session);
      await this.persistSessionSnapshot(session, { inputTokens: 0, outputTokens: 0 });
      return {
        ok: true,
        conversationId: session.conversationId,
        sandboxAddress: session.sandboxAddress ?? null,
        messages: [{ role: 'assistant', content: 'Operation cancelled.' }],
        pendingConfirmation: null,
      };
    }

    if (pending.executionMode === 'client_wallet') {
      return {
        ok: true,
        conversationId: session.conversationId,
        sandboxAddress: session.sandboxAddress ?? null,
        messages: [],
        pendingConfirmation: {
          toolUseId: pending.toolUseId,
          toolName: pending.toolName,
          toolInput: pending.toolInput,
          executionMode: 'client_wallet',
        },
      };
    }

    session.pendingConfirmation = null;
    const resultContent = await this.executeTool(
      session,
      pending.toolName as StoredDAppToolId,
      pending.toolInput,
      pending.toolUseId,
      true,
    );
    const toolMessage: AgentUiMessage = {
      role: 'tool',
      content: this.formatToolResult(pending.toolName, resultContent),
    };

    session.apiHistory.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: pending.toolUseId,
        content: resultContent,
      }],
    });
    await this.agentSessionService.saveSession(session);

    return this.continueLoop(session, [toolMessage]);
  }

  async sweepSandbox(credentialId: string, conversationId: string) {
    const session = await this.agentSessionService.getSession(
      credentialId,
      conversationId,
    );

    if (!session) {
      return { ok: false, error: 'Conversation not found' };
    }

    if (!session.walletAddress) {
      return { ok: false, error: 'User wallet address not found' };
    }

    const sandboxPrivateKey = this.agentSessionService.getSandboxPrivateKey(
      session,
    );
    if (!sandboxPrivateKey) {
      return { ok: false, error: 'Sandbox wallet not found' };
    }

    const result = await this.sandboxWalletService.sweepSandbox(
      session,
      sandboxPrivateKey,
      session.walletAddress,
    );

    return {
      ok: true,
      conversationId: session.conversationId,
      sandboxAddress: session.sandboxAddress ?? null,
      result,
    };
  }

  async deleteConversationSession(conversationId: string): Promise<void> {
    await this.agentSessionService.deleteSession(conversationId);
  }

  async submitClientToolResult(
    credentialId: string,
    input: {
      conversationId: string;
      toolUseId: string;
      result: string;
    },
  ) {
    const session = await this.agentSessionService.getSession(
      credentialId,
      input.conversationId,
    );

    if (!session) {
      return { ok: false, error: 'Conversation not found' };
    }

    const pending = session.pendingConfirmation;
    if (!pending || pending.toolUseId !== input.toolUseId) {
      return { ok: false, error: 'No matching pending client tool action found' };
    }

    session.pendingConfirmation = null;
    const parsed = this.safeJsonParse(input.result);
    await this.agentToolLogService.complete({
      conversationId: session.conversationId,
      toolUseId: input.toolUseId,
      outputJson: parsed,
      status: parsed?.error ? 'failed' : 'completed',
      errorCode: parsed?.error ? 'CLIENT_TOOL_EXECUTION_ERROR' : null,
      errorMessage: parsed?.error ? String(parsed.error) : null,
      txHash: typeof parsed?.txHash === 'string' ? parsed.txHash : null,
      confirmed: true,
    });

    const toolMessage: AgentUiMessage = {
      role: 'tool',
      content: this.formatToolResult(pending.toolName, input.result),
    };

    session.apiHistory.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: pending.toolUseId,
        content: input.result,
      }],
    });
    await this.agentSessionService.saveSession(session);

    return this.continueLoop(session, [toolMessage]);
  }

  private async continueLoop(
    session: AgentSessionRecord,
    uiMessages: AgentUiMessage[],
  ) {
    try {
    const repairedHistory = this.repairMissingToolResults(session.apiHistory);
    if (repairedHistory.changed) {
      session.apiHistory = repairedHistory.history;
      await this.agentSessionService.saveSession(session);
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (true) {
      const dapps = await this.dappsService.getPublicDapps();
      const mentionedDapps = this.resolveMentionedDapps(session.apiHistory, dapps);
      const toolPolicy = this.buildToolPolicy(mentionedDapps);
      const allowedTools = this.agentsService
        .getToolsByPolicy(toolPolicy)
        .map((tool) => tool.name);

      const response = await this.anthropic.messages.create({
        model: session.model,
        max_tokens: 4096,
        system: this.promptBuilderService.buildSystemPrompt({
          dapps: mentionedDapps,
          session,
          allowedTools,
        }),
        tools: this.agentsService.getToolsByPolicy(toolPolicy),
        messages: this.toAnthropicMessages(session.apiHistory),
      });
      const blocks = (response.content ?? []).map((block) => {
        if (block.type === 'text') {
          return { type: block.type, text: block.text } as AgentApiBlock;
        }
        if (block.type === 'tool_use') {
          return {
            type: block.type,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          } as AgentApiBlock;
        }
        return { type: block.type } as AgentApiBlock;
      });
      totalInputTokens += Number(response.usage.input_tokens ?? 0);
      totalOutputTokens += Number(response.usage.output_tokens ?? 0);

      session.apiHistory.push({ role: 'assistant', content: blocks });
      await this.agentSessionService.saveSession(session);

      const textContent = blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim();

      if (textContent) {
        uiMessages.push({ role: 'assistant', content: textContent });
      }

      const toolUses = blocks.filter((block) => block.type === 'tool_use');
      if (toolUses.length === 0) {
        await this.persistSessionSnapshot(session, {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });
        return {
          ok: true,
          conversationId: session.conversationId,
          sandboxAddress: session.sandboxAddress ?? null,
          messages: uiMessages,
          pendingConfirmation: null,
        };
      }

      for (let index = 0; index < toolUses.length; index += 1) {
        const toolUse = toolUses[index];
        const toolName = toolUse.name as StoredDAppToolId;
        const toolInput = (toolUse.input ?? {}) as Record<string, unknown>;

        if (DESTRUCTIVE_TOOLS.has(toolName)) {
          const executionMode = this.resolveDestructiveExecutionMode(
            session,
            toolName,
          );
          await this.agentToolLogService.createPending({
            conversationId: session.conversationId,
            credentialId: session.credentialId,
            toolUseId: toolUse.id ?? undefined,
            toolId: toolName,
            riskLevel: this.getToolRiskLevel(toolName),
            inputJson: toolInput,
            sandboxAddress: session.sandboxAddress ?? null,
            requiresConfirmation: true,
          });
          const pending: PendingToolConfirmation = {
            toolUseId: toolUse.id ?? '',
            toolName,
            toolInput,
            executionMode,
          };

          // Some providers require every tool_call_id in one assistant turn
          // to be answered before the next model call. If we pause for one
          // destructive confirmation, mark the remaining tool calls as deferred.
          const remainingToolUses = toolUses.slice(index + 1);
          if (remainingToolUses.length > 0) {
            const deferredContent = JSON.stringify({
              error:
                'Deferred because another destructive tool is awaiting confirmation. Re-request after confirmation.',
              code: 'DEFERRED_DUE_TO_CONFIRMATION',
            });
            for (const remaining of remainingToolUses) {
              if (!remaining.id) continue;
              session.apiHistory.push({
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: remaining.id,
                    content: deferredContent,
                  },
                ],
              });
            }
          }

          session.pendingConfirmation = pending;
          await this.agentSessionService.saveSession(session);
          await this.persistSessionSnapshot(session, {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          });
          return {
            ok: true,
            conversationId: session.conversationId,
            sandboxAddress: session.sandboxAddress ?? null,
            messages: uiMessages,
            pendingConfirmation: {
              toolUseId: toolUse.id ?? '',
              toolName,
              toolInput,
              executionMode,
            },
          };
        }

        await this.agentToolLogService.createPending({
          conversationId: session.conversationId,
          credentialId: session.credentialId,
          toolUseId: toolUse.id ?? undefined,
          toolId: toolName,
          riskLevel: this.getToolRiskLevel(toolName),
          inputJson: toolInput,
          sandboxAddress: session.sandboxAddress ?? null,
          requiresConfirmation: false,
        });
        const resultContent = await this.executeTool(
          session,
          toolName,
          toolInput,
          toolUse.id ?? undefined,
          false,
        );
        uiMessages.push({
          role: 'tool',
          content: this.formatToolResult(toolName, resultContent),
        });

        session.apiHistory.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: resultContent,
          }],
        });
        await this.agentSessionService.saveSession(session);
      }
    }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        conversationId: session.conversationId,
        sandboxAddress: session.sandboxAddress ?? null,
        messages: [
          ...uiMessages,
          {
            role: 'assistant' as const,
            content: `Error: ${message}`,
            isError: true,
          },
        ],
        pendingConfirmation: null,
        error: message,
      };
    }
  }

  private async persistConversation(
    session: AgentSessionRecord,
    usage: { inputTokens: number; outputTokens: number },
  ) {
    await this.aiService.recordChat(session.credentialId, {
      conversationId: session.conversationId,
      title: session.title,
      messages: this.toRecordMessages(session.apiHistory),
      model: session.model,
      usage,
    });
  }

  private async persistSessionSnapshot(
    session: AgentSessionRecord,
    usage: { inputTokens: number; outputTokens: number },
  ) {
    const hasUsage = usage.inputTokens > 0 || usage.outputTokens > 0;
    if (hasUsage) {
      await this.persistConversation(session, usage);
      return;
    }

    await this.aiService.syncConversation(
      session.credentialId,
      session.conversationId,
      this.toRecordMessages(session.apiHistory),
    );
  }

  private async executeTool(
    session: AgentSessionRecord,
    toolName: StoredDAppToolId,
    toolInput: Record<string, unknown>,
    toolUseId?: string,
    confirmed?: boolean,
  ): Promise<string> {
    const sandboxPrivateKey = session.sandboxMode
      ? this.agentSessionService.getSandboxPrivateKey(session)
      : null;
    const startedAt = Date.now();

    try {
        const result = await this.agentsService.executeTool(
          toolName,
          toolInput,
        {
          userId: 0,
          walletAddress:
            session.walletAddress ??
            '0x0000000000000000000000000000000000000000',
          privateKey: sandboxPrivateKey ?? undefined,
          isSandbox: Boolean(session.sandboxMode && session.sandboxAddress),
          sandboxAddress: session.sandboxAddress,
        },
        this.buildToolPolicy(
          this.resolveMentionedDapps(
            session.apiHistory,
            await this.dappsService.getPublicDapps(),
          ),
        ),
      );

      const parsed = this.safeJsonParse(result);
      await this.agentToolLogService.complete({
        conversationId: session.conversationId,
        toolUseId,
        outputJson: parsed,
        status: parsed?.error ? 'failed' : 'completed',
        errorCode: parsed?.error ? 'TOOL_EXECUTION_ERROR' : null,
        errorMessage: parsed?.error
          ? String(parsed.error)
          : null,
        txHash:
          typeof parsed?.txHash === 'string' ? parsed.txHash : null,
        confirmed: confirmed ?? null,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (error) {
      await this.agentToolLogService.complete({
        conversationId: session.conversationId,
        toolUseId,
        outputJson: null,
        status: 'failed',
        errorCode: 'TOOL_EXECUTION_THROWN',
        errorMessage: error instanceof Error ? error.message : String(error),
        confirmed: confirmed ?? null,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private toAnthropicMessages(history: AgentApiMessage[]): Anthropic.MessageParam[] {
    return history.map((message) => ({
      role: message.role,
      content: typeof message.content === 'string'
        ? message.content
        : message.content.map((block) => {
            if (block.type === 'tool_result') {
              return {
                type: 'tool_result' as const,
                tool_use_id: block.tool_use_id ?? '',
                content: block.content ?? '',
              };
            }
            if (block.type === 'tool_use') {
              return {
                type: 'tool_use' as const,
                id: block.id ?? '',
                name: block.name ?? '',
                input: block.input ?? {},
              };
            }
            return {
              type: 'text' as const,
              text: block.text ?? '',
            };
          }),
    }));
  }

  private toRecordMessages(history: AgentApiMessage[]) {
    return history.map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
        };
      }

      const blocks = msg.content;
      const toolUse = blocks
        .filter((block) => block.type === 'tool_use' && block.name && block.id)
        .map((block) => ({
          name: block.name as string,
          input: block.input as Record<string, unknown> | undefined,
          id: block.id as string,
        }));
      const toolResult = blocks
        .filter((block) => block.type === 'tool_result' && block.tool_use_id)
        .map((block) => ({
          tool_use_id: block.tool_use_id as string,
          content: block.content ?? '',
        }));

      return {
        role: msg.role,
        content: JSON.stringify(blocks),
        tool_use: toolUse.length > 0 ? toolUse : undefined,
        tool_result: toolResult.length > 0 ? toolResult : undefined,
      };
    });
  }

  private resolveMentionedDapps(messages: AgentApiMessage[], dapps: StoredDApp[]): StoredDApp[] {
    const mentionTokens = this.extractMentionTokens(messages);
    const searchableText = this.buildSearchableUserText(messages);
    const byMention = new Map<string, StoredDApp>();
    for (const dapp of dapps) {
      const candidates = [dapp.name, dapp.mentionPrompt, dapp.mentionLabel]
        .map((item) => this.normalizeMentionToken(item))
        .filter(Boolean) as string[];
      for (const token of candidates) {
        if (!byMention.has(token)) {
          byMention.set(token, dapp);
        }
      }
    }

    const matches = new Map<string, StoredDApp>();
    for (const token of mentionTokens) {
      const match = byMention.get(token);
      if (match) {
        matches.set(match.id, match);
      }
    }

    for (const dapp of dapps.filter((item) => item.aiDriven)) {
      const candidates = [dapp.name, dapp.mentionPrompt, dapp.mentionLabel]
        .map((item) => this.normalizeMentionToken(item))
        .filter(Boolean) as string[];
      if (candidates.some((candidate) => searchableText.includes(candidate))) {
        matches.set(dapp.id, dapp);
      }
    }

    return Array.from(matches.values());
  }

  private extractMentionTokens(messages: AgentApiMessage[]): string[] {
    const plainText = messages
      .filter((message) => message.role === 'user' && typeof message.content === 'string')
      .map((message) => message.content as string)
      .join(' ');

    const matches = plainText.match(/@[A-Za-z0-9_.-]+/g) ?? [];
    return Array.from(new Set(matches.map((token) => this.normalizeMentionToken(token)).filter(Boolean) as string[]));
  }

  private normalizeMentionToken(value?: string | null): string | null {
    const trimmed = value?.trim().toLowerCase();
    if (!trimmed) return null;
    const plain = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    const compact = plain.replace(/\s+/g, '');
    return compact || null;
  }

  private buildSearchableUserText(messages: AgentApiMessage[]): string {
    const plainText = messages
      .filter((message) => message.role === 'user' && typeof message.content === 'string')
      .map((message) => message.content as string)
      .join(' ')
      .toLowerCase();

    return plainText.replace(/[^a-z0-9@]+/g, '');
  }

  private buildToolPolicy(mentionedDapps: StoredDApp[]) {
    const explicitToolIds = new Set<StoredDAppToolId>(BASE_TOOL_IDS);

    for (const dapp of mentionedDapps.filter((item) => item.aiDriven)) {
      (dapp.toolIds ?? []).forEach((toolId) => explicitToolIds.add(toolId));
    }

    return {
      aiDriven: true,
      allowedToolNames: Array.from(explicitToolIds),
      dappName: mentionedDapps.map((item) => item.name).join(', '),
    };
  }

  private resolveDestructiveExecutionMode(
    session: AgentSessionRecord,
    toolName: StoredDAppToolId,
  ): 'backend_sandbox' | 'client_wallet' {
    if (session.sandboxMode) {
      return 'backend_sandbox';
    }

    if (toolName === 'execute_swap' || toolName === 'send_token') {
      return 'client_wallet';
    }

    return 'backend_sandbox';
  }

  private getToolRiskLevel(toolName: StoredDAppToolId): string {
    return (
      STORED_TOOL_DEFINITIONS.find((tool) => tool.id === toolName)?.riskLevel ??
      'safe'
    );
  }

  private safeJsonParse(raw: string): Record<string, unknown> | null {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { raw };
    }
  }

  private formatToolResult(name: string, raw: string): string {
    try {
      const parsed = JSON.parse(raw);
      return `🔧 **${name}**\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
    } catch {
      return `🔧 **${name}**: ${raw}`;
    }
  }

  private appendCancelledPendingToolResult(
    session: AgentSessionRecord,
    pending: PendingToolConfirmation,
    reason: string,
  ) {
    if (!pending.toolUseId) return;
    session.apiHistory.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: pending.toolUseId,
          content: JSON.stringify({
            error: reason,
            code: 'CANCELLED',
          }),
        },
      ],
    });
  }

  private repairMissingToolResults(history: AgentApiMessage[]): {
    changed: boolean;
    history: AgentApiMessage[];
  } {
    const repaired: AgentApiMessage[] = [];
    let changed = false;

    const isToolResultOnlyUserMessage = (message: AgentApiMessage) =>
      message.role === 'user' &&
      Array.isArray(message.content) &&
      message.content.length > 0 &&
      message.content.every((block) => block.type === 'tool_result');

    for (let i = 0; i < history.length; i += 1) {
      const current = history[i];
      repaired.push(current);

      if (current.role !== 'assistant' || !Array.isArray(current.content)) {
        continue;
      }

      const requiredToolUseIds = current.content
        .filter((block) => block.type === 'tool_use' && block.id)
        .map((block) => block.id as string);

      if (requiredToolUseIds.length === 0) {
        continue;
      }

      const existingToolResultIds = new Set<string>();
      for (let j = i + 1; j < history.length; j += 1) {
        const next = history[j];
        if (!isToolResultOnlyUserMessage(next)) {
          break;
        }
        for (const block of next.content as AgentApiBlock[]) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            existingToolResultIds.add(block.tool_use_id);
          }
        }
      }

      const missing = requiredToolUseIds.filter(
        (toolUseId) => !existingToolResultIds.has(toolUseId),
      );
      if (missing.length === 0) {
        continue;
      }

      changed = true;
      repaired.push({
        role: 'user',
        content: missing.map((toolUseId) => ({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: JSON.stringify({
            error:
              'Recovered missing tool result from previous incomplete turn.',
            code: 'RECOVERED_MISSING_TOOL_RESULT',
          }),
        })),
      });
    }

    return { changed, history: repaired };
  }
}
