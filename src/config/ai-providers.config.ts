/**
 * AI Providers Configuration
 * Supported AI providers and their model mappings
 */

export const AI_PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    apiKey: process.env.ANTHROPIC_API_KEY,
    models: [
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
    ],
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    models: [
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
    ],
  },
} as const;

export type AIProviderName = keyof typeof AI_PROVIDERS;

export interface AIModelConfig {
  provider: AIProviderName;
  modelId: string; // Provider-specific model identifier
}

// Map frontend model names to provider + model ID
export const MODEL_MAPPING: Record<string, AIModelConfig> = {
  // Anthropic models
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6-20250514',
  },
  'claude-sonnet-4-5': {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5-20250514',
  },
  'claude-3.5-sonnet': {
    provider: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
  },

  // OpenAI models
  'gpt-4o': { provider: 'openai', modelId: 'gpt-4o' },
  'gpt-4o-mini': { provider: 'openai', modelId: 'gpt-4o-mini' },

  // OpenRouter models (use prefix format)
  'claude-3.5-sonnet-or': {
    provider: 'openrouter',
    modelId: 'anthropic/claude-3.5-sonnet',
  },
  'gpt-4o-or': { provider: 'openrouter', modelId: 'openai/gpt-4o' },
};

/**
 * Get provider config by name
 */
export function getProviderConfig(providerName: AIProviderName) {
  return AI_PROVIDERS[providerName];
}

/**
 * Get model config by frontend model name
 */
export function getModelConfig(modelName: string): AIModelConfig | null {
  return MODEL_MAPPING[modelName] || null;
}

/**
 * Get all available models
 */
export function getAllModels() {
  return Object.entries(MODEL_MAPPING).map(([name, config]) => ({
    name,
    provider: config.provider,
    modelId: config.modelId,
  }));
}
