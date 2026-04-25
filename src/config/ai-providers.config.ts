import { getAgentApiKey, getAgentBaseUrl } from '../ai/ai-runtime.config';

/**
 * AI Providers Configuration
 * Supported AI providers and their model mappings
 */

export const AI_PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    baseUrl: getAgentBaseUrl(),
    apiKey: getAgentApiKey(),
    models: [
      'gpt-5.1',
      'gpt-4o-mini',
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
  'gpt-5.1': { provider: 'anthropic', modelId: 'gpt-5.1' },
  'gpt-4o-mini': { provider: 'anthropic', modelId: 'gpt-4o-mini' },
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
