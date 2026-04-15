import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

type FrontendEnvMap = Record<string, string>;

let cachedFrontendEnv: FrontendEnvMap | null = null;

function parseDotEnv(raw: string): FrontendEnvMap {
  const env: FrontendEnvMap = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function loadFrontendEnv(): FrontendEnvMap {
  if (cachedFrontendEnv) {
    return cachedFrontendEnv;
  }

  const candidates = [
    resolve(process.cwd(), '../inj-pass-frontend/.env'),
    resolve(process.cwd(), 'inj-pass-frontend/.env'),
    join(__dirname, '../../../inj-pass-frontend/.env'),
    join(__dirname, '../../../../inj-pass-frontend/.env'),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }

    cachedFrontendEnv = parseDotEnv(readFileSync(filePath, 'utf8'));
    return cachedFrontendEnv;
  }

  cachedFrontendEnv = {};
  return cachedFrontendEnv;
}

export function getSharedAiEnv(key: string): string | undefined {
  const direct = process.env[key]?.trim();
  if (direct) {
    return direct;
  }

  const frontendValue = loadFrontendEnv()[key]?.trim();
  return frontendValue || undefined;
}

export function getAgentBaseUrl(): string {
  return getSharedAiEnv('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com';
}

export function getAgentApiKey(): string | undefined {
  return getSharedAiEnv('ANTHROPIC_API_KEY');
}

export function getDefaultAgentModel(): string {
  return getSharedAiEnv('AGENT_MODEL_DEFAULT') || 'gpt-5.1';
}
