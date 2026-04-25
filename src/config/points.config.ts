/**
 * Points Configuration
 * NINJA token economics and AI pricing settings
 */

export const POINTS_CONFIG = {
  // Initial NINJA bonus for new users
  INITIAL_BONUS: 5,

  // Tap Game reward range (per tap)
  TAP_GAME: {
    MIN: 0.01,
    MAX: 0.09,
  },

  // Referral rewards
  REFERRAL: {
    // Reward for the inviter when invitee registers
    INVITER_REWARD: 10,
    // Reward for the invitee when they register with an invite code
    INVITEE_REWARD: 10,
  },

  // AI pricing configuration
  AI: {
    // Model pricing per 1K tokens (in USD)
    MODELS: {
      // Source prices are per 1M tokens from the provider UI.
      // We store them here per 1K tokens because downstream billing uses /1000.
      'gpt-5.1': { input: 0.00075, output: 0.006 },
      'gpt-4o-mini': { input: 0.00009, output: 0.00036 },
    },
    // If frontend sends an unknown model, bill using this default model.
    DEFAULT_MODEL: 'gpt-5.1',
    // Map frontend display/alias model names to billable models.
    MODEL_ALIASES: {},
    // NINJA tokens per 1 USD (adjustable for economic balancing)
    // e.g., 100 means 1 USD = 100 NINJA
    NINJA_PER_DOLLAR: 100,
  },

  // Invite code generation
  INVITE_CODE: {
    LENGTH: 8,
    CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // Exclude similar-looking chars
  },
} as const;

// Type exports
export type PointsTransactionType = 'tap_game' | 'referral_bonus' | 'ai_spent';

export interface AIModelPricing {
  input: number; // Price per 1K input tokens in USD
  output: number; // Price per 1K output tokens in USD
}

export interface PointsTransaction {
  userId: number;
  type: PointsTransactionType;
  amount: number;
  balanceAfter: number;
  metadata?: Record<string, unknown>;
}

export interface AIUsageRecord {
  userId: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costNinja: number;
  conversationId?: string;
}
