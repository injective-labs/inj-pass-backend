export type StoredDAppCategory = string;
export type StoredDAppPrimaryCategory = StoredDAppCategory;

export const STORED_DAPP_CAPABILITIES = [
  'read',
  'quote',
  'transact',
  'sign',
  'position',
  'game',
] as const;

export type StoredDAppCapability = (typeof STORED_DAPP_CAPABILITIES)[number];

export const STORED_DAPP_TOOL_IDS = [
  'get_wallet_info',
  'get_balance',
  'get_swap_quote',
  'execute_swap',
  'send_token',
  'get_tx_history',
  'play_hash_mahjong',
  'play_hash_mahjong_multi',
] as const;

export type StoredDAppToolId = (typeof STORED_DAPP_TOOL_IDS)[number];

export const STORED_TOOL_CATEGORIES = [
  'read',
  'quote',
  'transact',
  'sign',
  'position',
  'game',
] as const;

export type StoredToolCategory = (typeof STORED_TOOL_CATEGORIES)[number];

export const STORED_TOOL_RISK_LEVELS = [
  'safe',
  'confirm_required',
  'destructive',
] as const;

export type StoredToolRiskLevel = (typeof STORED_TOOL_RISK_LEVELS)[number];

export const STORED_TOOL_STATUSES = [
  'active',
  'disabled',
  'deprecated',
] as const;

export type StoredToolStatus = (typeof STORED_TOOL_STATUSES)[number];

export interface StoredToolDefinition {
  id: StoredDAppToolId;
  displayName: string;
  description: string;
  category: StoredToolCategory;
  riskLevel: StoredToolRiskLevel;
  status: StoredToolStatus;
  capabilities: StoredDAppCapability[];
}

export const STORED_TOOL_DEFINITIONS: StoredToolDefinition[] = [
  {
    id: 'get_wallet_info',
    displayName: 'Get Wallet Info',
    description: 'Read wallet address and chain metadata.',
    category: 'read',
    riskLevel: 'safe',
    status: 'active',
    capabilities: ['read'],
  },
  {
    id: 'get_balance',
    displayName: 'Get Balance',
    description: 'Read INJ, USDT, and USDC balances.',
    category: 'read',
    riskLevel: 'safe',
    status: 'active',
    capabilities: ['read'],
  },
  {
    id: 'get_tx_history',
    displayName: 'Get Tx History',
    description: 'Read recent onchain transaction history.',
    category: 'read',
    riskLevel: 'safe',
    status: 'active',
    capabilities: ['read'],
  },
  {
    id: 'get_swap_quote',
    displayName: 'Get Swap Quote',
    description: 'Get swap quote and route details before execution.',
    category: 'quote',
    riskLevel: 'safe',
    status: 'active',
    capabilities: ['quote'],
  },
  {
    id: 'execute_swap',
    displayName: 'Execute Swap',
    description: 'Execute a token swap on Injective EVM.',
    category: 'transact',
    riskLevel: 'destructive',
    status: 'active',
    capabilities: ['transact'],
  },
  {
    id: 'send_token',
    displayName: 'Send Token',
    description: 'Send INJ to another wallet address.',
    category: 'transact',
    riskLevel: 'destructive',
    status: 'active',
    capabilities: ['transact'],
  },
  {
    id: 'play_hash_mahjong',
    displayName: 'Play Hash Mahjong',
    description: 'Play one paid round of Hash Mahjong.',
    category: 'game',
    riskLevel: 'destructive',
    status: 'active',
    capabilities: ['game'],
  },
  {
    id: 'play_hash_mahjong_multi',
    displayName: 'Play Hash Mahjong Multi',
    description: 'Play multiple paid rounds of Hash Mahjong.',
    category: 'game',
    riskLevel: 'destructive',
    status: 'active',
    capabilities: ['game'],
  },
];

export interface StoredDAppTab {
  id: StoredDAppCategory;
  label: string;
  order: number;
  enabled: boolean;
}

export interface StoredDApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  categories: StoredDAppCategory[];
  primaryCategory?: StoredDAppPrimaryCategory;
  capabilities?: StoredDAppCapability[];
  toolIds?: StoredDAppToolId[];
  aiDriven?: boolean;
  order: number;
  url: string;
  featured?: boolean;
  aiPrompt?: string;
  aiPromptVersion?: string;
  mentionPrompt?: string;
  mentionLabel?: string;
  mentionThemeKey?: string;
  createdAt: string;
  updatedAt: string;
}
