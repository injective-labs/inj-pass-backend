import { Injectable } from '@nestjs/common';
import { AGENT_SYSTEM_PROMPT } from './agents/agents.config';
import type { StoredDApp } from '../dapps/dapps.constants';
import type { AgentSessionRecord } from './agent-session.service';

@Injectable()
export class PromptBuilderService {
  buildSystemPrompt(input: {
    dapps: StoredDApp[];
    session: AgentSessionRecord;
    allowedTools: string[];
  }): string {
    const sections = [
      this.buildBaseSection(),
      this.buildRuntimeSection(input.session),
      this.buildDappProfileSection(input.dapps),
      this.buildDappPromptSection(input.dapps),
      this.buildToolPolicySection(input.allowedTools),
      this.buildSafetySection(),
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  private buildBaseSection(): string {
    return AGENT_SYSTEM_PROMPT;
  }

  private buildRuntimeSection(session: AgentSessionRecord): string {
    if (session.sandboxMode && session.sandboxAddress) {
      return [
        'RUNTIME CONTEXT:',
        `- sandbox mode: enabled`,
        `- primary wallet address: ${session.walletAddress ?? 'unknown'}`,
        `- active sandbox address: ${session.sandboxAddress}`,
        '- wallet read questions should default to the primary wallet unless the user explicitly asks about the sandbox wallet',
        '- destructive actions execute from the sandbox wallet only',
      ].join('\n');
    }

    return [
      'RUNTIME CONTEXT:',
      '- sandbox mode: disabled',
      `- real wallet address: ${session.walletAddress ?? 'unknown'}`,
      '- wallet read questions should use the real wallet address',
      '- swaps and transfers must be prepared by the assistant but signed from the real wallet with a client-side passkey flow',
    ].join('\n');
  }

  private buildDappProfileSection(dapps: StoredDApp[]): string {
    if (dapps.length === 0) {
      return '';
    }

    const profileText = dapps
      .map((dapp) => {
        const toolText = (dapp.toolIds ?? []).join(', ') || '-';
        return `- ${dapp.name} [aiDriven=${dapp.aiDriven ? 'true' : 'false'}; tools=${toolText}]`;
      })
      .join('\n');

    return `ACTIVE DAPP PROFILES:\n${profileText}`;
  }

  private buildDappPromptSection(dapps: StoredDApp[]): string {
    const promptLines = dapps
      .filter((dapp) => dapp.aiDriven && dapp.aiPrompt)
      .map((dapp) => {
        const version = dapp.aiPromptVersion?.trim() || 'v1';
        return [`DAPP PROMPT: ${dapp.name} (${version})`, dapp.aiPrompt!.trim()].join('\n');
      });

    return promptLines.join('\n\n');
  }

  private buildToolPolicySection(allowedTools: string[]): string {
    if (allowedTools.length === 0) {
      return '';
    }

    return `ALLOWED TOOLS:\n${allowedTools.map((tool) => `- ${tool}`).join('\n')}`;
  }

  private buildSafetySection(): string {
    return [
      'SAFETY POLICY:',
      '- never describe unavailable tools as if they are enabled',
      '- never fabricate tool output',
      '- destructive tools require confirmation before execution',
    ].join('\n');
  }
}
