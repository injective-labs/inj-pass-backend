/**
 * AI Agent Configuration
 * System prompt, tool definitions, and rules migrated from frontend
 */

export type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
};

export const AGENT_SYSTEM_PROMPT = `You are an AI agent integrated into INJ Pass, a non-custodial Web3 wallet for Injective mainnet.
The user is already authenticated.

CAPABILITIES:
- get_wallet_info: get the active wallet address and network information
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
3. After a destructive tool is proposed, wait for confirmation before execution.
4. When the user asks for their address or wallet, call get_wallet_info.
5. Never ask for private keys.
6. After a safe tool returns results, continue the task autonomously.
7. For Hash Mahjong: display the tile emojis and the win rule clearly. For multi-round play, show a round-by-round table and a final summary.
8. Cap play_hash_mahjong_multi at 20 rounds maximum.
9. If sandbox mode is enabled, destructive actions run from the sandbox wallet. Wallet read requests should still default to the user's primary wallet unless the user explicitly asks about the sandbox wallet.
10. If sandbox mode is disabled, swaps and transfers still require confirmation and are then signed from the user's primary wallet through the client passkey flow.

Respond in the same language the user writes in. Be concise and direct.`;

export const AGENT_TOOLS: AnthropicTool[] = [
  {
    name: 'get_wallet_info',
    description: 'Get the active wallet address and network information.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_balance',
    description: 'Get the current INJ, USDT and USDC balances of the active wallet.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_swap_quote',
    description: 'Get a price quote BEFORE executing a swap. Always call this first. Supports INJ↔USDT, INJ↔USDC, USDT↔USDC.',
    input_schema: {
      type: 'object',
      properties: {
        fromToken: { type: 'string', enum: ['INJ', 'USDT', 'USDC'], description: 'Token to sell' },
        toToken: { type: 'string', enum: ['INJ', 'USDT', 'USDC'], description: 'Token to buy' },
        amount: { type: 'string', description: 'Amount to swap e.g. "0.5"' },
        slippage: { type: 'number', description: 'Slippage % (default 0.5)' },
      },
      required: ['fromToken', 'toToken', 'amount'],
    },
  },
  {
    name: 'execute_swap',
    description: 'Execute a token swap on Injective EVM. ALWAYS call get_swap_quote first. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        fromToken: { type: 'string', enum: ['INJ', 'USDT', 'USDC'] },
        toToken: { type: 'string', enum: ['INJ', 'USDT', 'USDC'] },
        amount: { type: 'string' },
        slippage: { type: 'number', description: 'Default 0.5' },
        expectedOutput: { type: 'string', description: 'Optional quote output shown to the user before confirm' },
      },
      required: ['fromToken', 'toToken', 'amount'],
    },
  },
  {
    name: 'send_token',
    description: 'Send INJ to another address. Requires confirmation.',
    input_schema: {
      type: 'object',
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
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of txs (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'play_hash_mahjong',
    description: 'Play one round of Hash Mahjong on Injective EVM. Costs 0.000001 INJ. Requires confirmation.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'play_hash_mahjong_multi',
    description: 'Play Hash Mahjong multiple times in a row. Costs 0.000001 INJ per round. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        rounds: { type: 'number', description: 'Number of rounds to play (1–20). Default 5.' },
      },
      required: ['rounds'],
    },
  },
];

export interface AgentContext {
  userId: number;
  walletAddress: string;
  privateKey?: string;
  isSandbox?: boolean;
  sandboxAddress?: string;
}
