/**
 * Agents Service
 * Main service for executing AI agent tools
 */

import { Injectable, Logger } from '@nestjs/common';
import { AgentContext, AGENT_TOOLS } from './agents.config';
import type { StoredDAppCapability } from '../../dapps/dapps.constants';
import * as walletTools from './tools/wallet.tools';
import * as swapTools from './tools/swap.tools';
import * as gameTools from './tools/game.tools';

const TOOL_TO_CAPABILITY: Record<string, StoredDAppCapability | 'base'> = {
  get_wallet_info: 'base',
  get_balance: 'wallet_read',
  get_tx_history: 'wallet_read',
  get_swap_quote: 'swap',
  execute_swap: 'swap',
  send_token: 'transfer',
  play_hash_mahjong: 'game_action',
  play_hash_mahjong_multi: 'game_action',
};

export type AgentToolPolicy = {
  allowedToolNames?: string[];
  allowedCapabilities?: StoredDAppCapability[];
  aiDriven?: boolean;
  dappName?: string;
};

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  /**
   * Execute a tool by name
   */
  async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: AgentContext,
    policy?: AgentToolPolicy,
  ): Promise<string> {
    this.logger.log(`[executeTool] ${name}`, input);

    if (!this.isToolAllowed(name, policy)) {
      this.logger.warn(
        `[executeTool] Blocked by policy: ${name} (dapp=${policy?.dappName ?? 'unknown'})`,
      );
      return JSON.stringify({
        error: `Tool not allowed by active dapp policy: ${name}`,
      });
    }

    try {
      let result: unknown;

      switch (name) {
        case 'get_wallet_info':
          result = await walletTools.getWalletInfo(context);
          break;

        case 'get_balance':
          result = await walletTools.getBalance(context);
          break;

        case 'get_swap_quote':
          result = await swapTools.getSwapQuote(
            context,
            input.fromToken as string,
            input.toToken as string,
            input.amount as string,
            input.slippage as number | undefined,
          );
          break;

        case 'execute_swap':
          result = await swapTools.executeSwap(
            context,
            input.fromToken as string,
            input.toToken as string,
            input.amount as string,
            input.slippage as number | undefined,
            input.expectedOutput as string | undefined,
          );
          break;

        case 'send_token':
          result = await walletTools.sendToken(
            context,
            input.toAddress as string,
            input.amount as string,
          );
          break;

        case 'get_tx_history':
          result = await walletTools.getTxHistory(
            context,
            input.limit as number | undefined,
          );
          break;

        case 'play_hash_mahjong':
          result = await gameTools.playHashMahjong(context);
          break;

        case 'play_hash_mahjong_multi':
          result = await gameTools.playHashMahjongMulti(
            context,
            input.rounds as number | undefined,
          );
          break;

        default:
          return JSON.stringify({ error: `Unknown tool: ${name}` });
      }

      return JSON.stringify(result);
    } catch (error) {
      this.logger.error(`[executeTool] Error executing ${name}:`, error);
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get available tools
   */
  getTools() {
    return AGENT_TOOLS;
  }

  getToolsByPolicy(policy?: AgentToolPolicy) {
    if (!policy) return AGENT_TOOLS;
    return AGENT_TOOLS.filter((tool) => this.isToolAllowed(tool.name, policy));
  }

  private isToolAllowed(name: string, policy?: AgentToolPolicy): boolean {
    if (!policy) return true;

    if (policy.aiDriven === false) {
      return false;
    }

    const allowedToolNames = policy.allowedToolNames;
    if (Array.isArray(allowedToolNames) && allowedToolNames.length > 0) {
      return allowedToolNames.includes(name);
    }

    const mappedCapability = TOOL_TO_CAPABILITY[name];
    if (!mappedCapability) return false;
    if (mappedCapability === 'base') return true;

    const allowedCapabilities = policy.allowedCapabilities ?? [];
    return allowedCapabilities.includes(mappedCapability);
  }
}
