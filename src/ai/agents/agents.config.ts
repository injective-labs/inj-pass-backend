/**
 * AI Agent Configuration
 * System prompt, tool definitions, and rules migrated from frontend
 */

// Tool type for Anthropic messages API
export type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
};

// ─── System Prompt ───────────────────────────────────────────────────────────────

export const AGENT_SYSTEM_PROMPT = `You are an AI agent integrated into INJ Pass, a non-custodial Web3 wallet for Injective mainnet.
The user is already authenticated and their wallet is unlocked.

CAPABILITIES:
- get_wallet_info: get the user's wallet address
- get_balance: get INJ, USDT, USDC balances
- get_swap_quote: get a price quote before swapping
- execute_swap: swap tokens (INJ↔USDT, INJ↔USDC, USDT↔USDC)
- send_token: send INJ to another address
- get_tx_history: view recent transactions
- play_hash_mahjong: play one round of Hash Mahjong (costs 0.000001 INJ)
- play_hash_mahjong_multi: play N rounds of Hash Mahjong and get a win summary (costs 0.000001 INJ × N)

RULES:
1. When the user asks to "swap all" or uses vague amounts, call get_balance FIRST to get the exact amount, then get_swap_quote, then execute_swap.
2. ALWAYS call get_swap_quote before execute_swap so the user sees the expected output.
3. After execute_swap succeeds, always report the transaction hash and the Blockscout explorer link.
4. When the user asks for their address/wallet, call get_wallet_info.
5. Never ask for private keys — they are managed securely by the wallet.
6. After a safe tool returns results, continue the task autonomously without asking for confirmation again unless it is a destructive action (swap, send, or mahjong play).
7. For Hash Mahjong: display the tile emojis and the win rule clearly. For multi-round play, show a round-by-round table and a final summary (total rounds, wins, win rate, best rule).
8. Cap play_hash_mahjong_multi at 20 rounds maximum to protect the user's balance.

Respond in the same language the user writes in. Be concise and direct.`;

// ─── Tool Definitions ───────────────────────────────────────────────────────────

export const AGENT_TOOLS: AnthropicTool[] = [
  {
    name: 'get_wallet_info',
    description: 'Get the user wallet address and network information.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_balance',
    description:
      'Get the current INJ, USDT and USDC balances of the user wallet.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_swap_quote',
    description:
      'Get a price quote BEFORE executing a swap. Always call this first. Supports INJ↔USDT, INJ↔USDC, USDT↔USDC.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromToken: {
          type: 'string',
          enum: ['INJ', 'USDT', 'USDC'],
          description: 'Token to sell',
        },
        toToken: {
          type: 'string',
          enum: ['INJ', 'USDT', 'USDC'],
          description: 'Token to buy',
        },
        amount: { type: 'string', description: 'Amount to swap e.g. "0.5"' },
        slippage: { type: 'number', description: 'Slippage % (default 0.5)' },
      },
      required: ['fromToken', 'toToken', 'amount'],
    },
  },
  {
    name: 'execute_swap',
    description:
      'Execute a token swap on Injective EVM. ALWAYS call get_swap_quote first. Requires user confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromToken: { type: 'string', enum: ['INJ', 'USDT', 'USDC'] },
        toToken: { type: 'string', enum: ['INJ', 'USDT', 'USDC'] },
        amount: { type: 'string' },
        slippage: { type: 'number', description: 'Default 0.5' },
        expectedOutput: {
          type: 'string',
          description: 'From get_swap_quote, shown in confirmation dialog',
        },
      },
      required: ['fromToken', 'toToken', 'amount'],
    },
  },
  {
    name: 'send_token',
    description: 'Send INJ to another address. Requires user confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        toAddress: { type: 'string', description: 'Recipient 0x address' },
        amount: { type: 'string', description: 'Amount of INJ' },
      },
      required: ['toAddress', 'amount'],
    },
  },
  {
    name: 'get_tx_history',
    description: 'Get recent transaction history.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Number of txs (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'play_hash_mahjong',
    description:
      'Play one round of Hash Mahjong on Injective EVM. Costs 0.000001 INJ. ' +
      'Sends a transaction to the game contract, derives 10 mahjong tiles from ' +
      'the tx hash, and evaluates 18 win rules. Requires user confirmation.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'play_hash_mahjong_multi',
    description:
      'Play Hash Mahjong multiple times in a row. Costs 0.000001 INJ per round. ' +
      'Plays all rounds sequentially and returns a complete win/loss summary with ' +
      'tile hands and matched rules. Requires user confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rounds: {
          type: 'number',
          description: 'Number of rounds to play (1–20). Default 5.',
        },
      },
      required: ['rounds'],
    },
  },
];

// ─── Agent Context ─────────────────────────────────────────────────────────────

export interface AgentContext {
  userId: number;
  walletAddress: string;
  privateKey: string; // Hex format
  isSandbox?: boolean;
  sandboxAddress?: string;
}
