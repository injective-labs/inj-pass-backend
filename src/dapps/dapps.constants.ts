export type StoredDAppCategory = string;

export const STORED_DAPP_PRIMARY_CATEGORIES = [
  'defi',
  'gaming',
  'nft',
  'social',
  'infrastructure',
  'payments',
  'data-oracle',
  'bridge',
  'utility',
] as const;

export type StoredDAppPrimaryCategory =
  (typeof STORED_DAPP_PRIMARY_CATEGORIES)[number];

export const STORED_DAPP_CAPABILITIES = [
  'wallet_read',
  'swap',
  'transfer',
  'game_action',
  'sign_message',
  'defi_lend',
  'defi_borrow',
  'defi_stake',
  'nft_mint',
  'bridge',
] as const;

export type StoredDAppCapability = (typeof STORED_DAPP_CAPABILITIES)[number];

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
  aiDriven?: boolean;
  order: number;
  url: string;
  featured?: boolean;
  mentionPrompt?: string;
  mentionLabel?: string;
  mentionThemeKey?: string;
  createdAt: string;
  updatedAt: string;
}
