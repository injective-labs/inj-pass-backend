import { AgentContext } from '../agents.config';
import { Wallet, parseEther } from 'ethers';
import {
  EVM_CONTRACTS,
  HASH_MAHJONG_CONFIG,
  getBlockscoutTxUrl,
  getEvmProvider,
} from '../../../config/evm-network.config';

interface HashMahjongResult {
  txHash: string;
  tiles: string;
  seed10: string;
  win: boolean;
  rule: string | null;
  explorerUrl: string;
}

interface MultiMahjongResult {
  totalRounds: number;
  wins: number;
  losses: number;
  winRate: string;
  bestRule: string | null;
  results: {
    round: number;
    txHash: string;
    tiles: string;
    win: boolean;
    rule: string | null;
  }[];
}

const HM_TILE: Record<string, string> = {
  '0': '🀆', '1': '🀇', '2': '🀈', '3': '🀉', '4': '🀊',
  '5': '🀋', '6': '🀌', '7': '🀍', '8': '🀎', '9': '🀏',
  a: '🀐', b: '🀑', c: '🀒', d: '🀓', e: '🀄', f: '🀅',
};
const HM_GAME_ADDRESS = EVM_CONTRACTS.hashMahjongAddress;
const HM_PLAY_COST = HASH_MAHJONG_CONFIG.playCostInj;

interface HMRule {
  id: number;
  name: string;
  payout: string;
}

const MAX_PLAY_SEND_RETRIES = 3;
const RETRY_DELAY_MS = 600;

function hmCounts(s: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const char of s) counts[char] = (counts[char] || 0) + 1;
  return counts;
}

function hmPairs(counts: Record<string, number>) { return Object.values(counts).filter((value) => value === 2).length; }
function hmTriples(counts: Record<string, number>) { return Object.values(counts).filter((value) => value === 3).length; }
function hmHasAtLeast(counts: Record<string, number>, n: number) { return Object.values(counts).some((value) => value >= n); }
function hmHasExact(counts: Record<string, number>, n: number) { return Object.values(counts).some((value) => value === n); }
function hmCountExact(counts: Record<string, number>, n: number) { return Object.values(counts).filter((value) => value === n).length; }
function hmHexVal(char: string) { const value = parseInt(char, 16); return Number.isFinite(value) ? value : null; }

function hmStraight(seed: string, len: number) {
  const values = seed.split('').map(hmHexVal);
  for (let i = 0; i <= values.length - len; i += 1) {
    let asc = true;
    let desc = true;
    for (let j = 1; j < len; j += 1) {
      if (values[i + j] !== (values[i] as number) + j) asc = false;
      if (values[i + j] !== (values[i] as number) - j) desc = false;
    }
    if (asc || desc) return true;
  }
  return false;
}

function hmDouble4(seed: string) {
  const values = seed.split('').map(hmHexVal);
  const runs: [number, number][] = [];
  for (let i = 0; i <= 6; i += 1) {
    let asc = true;
    let desc = true;
    for (let j = 1; j < 4; j += 1) {
      if (values[i + j] !== (values[i] as number) + j) asc = false;
      if (values[i + j] !== (values[i] as number) - j) desc = false;
    }
    if (asc || desc) runs.push([i, i + 3]);
  }
  for (let x = 0; x < runs.length; x += 1) {
    for (let y = x + 1; y < runs.length; y += 1) {
      if (runs[x][1] < runs[y][0] || runs[y][1] < runs[x][0]) return true;
    }
  }
  return false;
}

const HM_RULES: { id: number; name: string; payout: string; test: (seed: string, counts: Record<string, number>) => boolean }[] = [
  { id: 1, name: 'Tenfold Harmony', payout: '10000x', test: (_, counts) => hmHasAtLeast(counts, 10) },
  { id: 2, name: 'Ninefold Harmony', payout: '2000x', test: (_, counts) => hmHasAtLeast(counts, 9) },
  { id: 3, name: 'Eightfold Harmony', payout: '500x', test: (_, counts) => hmHasAtLeast(counts, 8) },
  { id: 4, name: 'Sevenfold Harmony', payout: '200x', test: (_, counts) => hmHasAtLeast(counts, 7) },
  { id: 5, name: 'Sixfold Harmony', payout: '80x', test: (_, counts) => hmHasAtLeast(counts, 6) },
  { id: 6, name: 'Fivefold Harmony', payout: '30x', test: (_, counts) => hmHasAtLeast(counts, 5) },
  { id: 7, name: 'Double Quads', payout: '200x', test: (_, counts) => hmCountExact(counts, 4) >= 2 },
  { id: 8, name: 'Quad + Triple', payout: '120x', test: (_, counts) => hmHasExact(counts, 4) && hmHasExact(counts, 3) },
  { id: 9, name: 'Three Triples', payout: '90x', test: (_, counts) => hmTriples(counts) >= 3 },
  { id: 10, name: 'Two Triples', payout: '35x', test: (_, counts) => hmTriples(counts) >= 2 },
  { id: 11, name: 'Five Pairs', payout: '25x', test: (_, counts) => hmPairs(counts) === 5 && Object.keys(counts).length === 5 },
  { id: 12, name: 'Four Pairs', payout: '10x', test: (_, counts) => hmPairs(counts) === 4 },
  { id: 13, name: 'Full House', payout: '20x', test: (_, counts) => hmTriples(counts) >= 1 && hmPairs(counts) >= 1 },
  { id: 14, name: 'Any Triple', payout: '5x', test: (_, counts) => hmTriples(counts) >= 1 },
  { id: 15, name: 'Straight-5', payout: '15x', test: (seed) => hmStraight(seed, 5) },
  { id: 16, name: 'Double Straight-4', payout: '30x', test: (seed) => hmDouble4(seed) },
  { id: 17, name: 'Palindrome', payout: '50x', test: (seed) => seed === seed.split('').reverse().join('') },
  { id: 18, name: 'Alternating AB', payout: '40x', test: (seed) => seed.length === 10 && seed[0] !== seed[1] && [...seed].every((char, index) => char === seed[index % 2 === 0 ? 0 : 1]) },
];

function hmEvaluate(seed10: string): HMRule | null {
  const counts = hmCounts(seed10);
  for (const rule of HM_RULES) {
    if (rule.test(seed10, counts)) {
      return { id: rule.id, name: rule.name, payout: rule.payout };
    }
  }
  return null;
}

function hmPlayResult(txHash: string) {
  const seed10 = txHash.replace(/^0x/i, '').slice(-10).toLowerCase();
  const tiles = seed10.split('').map((char) => HM_TILE[char] ?? '?').join('');
  const rule = hmEvaluate(seed10);
  return { seed10, tiles, win: Boolean(rule), rule };
}

function shouldRetryRpcError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  return (
    message.includes('internal error') ||
    message.includes('unexpected end of json input') ||
    message.includes('ssl_error_syscall') ||
    message.includes('ecconnreset') ||
    message.includes('network socket disconnected') ||
    message.includes('could not coalesce error')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playOnce(context: AgentContext) {
  if (!context.privateKey || !context.isSandbox) {
    throw new Error('Hash Mahjong requires a backend-managed sandbox wallet.');
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_PLAY_SEND_RETRIES; attempt += 1) {
    try {
      const provider = getEvmProvider();
      const wallet = new Wallet(context.privateKey, provider);
      const tx = await wallet.sendTransaction({
        to: HM_GAME_ADDRESS,
        value: parseEther(HM_PLAY_COST),
      });
      await tx.wait();
      const result = hmPlayResult(tx.hash);
      return {
        txHash: tx.hash,
        tiles: result.tiles,
        seed10: result.seed10,
        win: result.win,
        rule: result.rule ? `${result.rule.name} (${result.rule.payout})` : null,
        explorerUrl: getBlockscoutTxUrl(tx.hash),
      };
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_PLAY_SEND_RETRIES || !shouldRetryRpcError(error)) {
        throw error;
      }
      await delay(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Unknown play error'));
}

export async function playHashMahjong(
  context: AgentContext,
): Promise<HashMahjongResult> {
  return playOnce(context);
}

export async function playHashMahjongMulti(
  context: AgentContext,
  rounds: number = 5,
): Promise<MultiMahjongResult> {
  const actualRounds = Math.min(Math.max(1, Number(rounds) || 5), 20);
  const results: MultiMahjongResult['results'] = [];

  for (let i = 0; i < actualRounds; i += 1) {
    const result = await playOnce(context);
    results.push({
      round: i + 1,
      txHash: result.txHash,
      tiles: result.tiles,
      win: result.win,
      rule: result.rule,
    });
  }

  const wins = results.filter((item) => item.win);

  return {
    totalRounds: actualRounds,
    wins: wins.length,
    losses: actualRounds - wins.length,
    winRate: `${((wins.length / actualRounds) * 100).toFixed(1)}%`,
    bestRule: wins[0]?.rule ?? null,
    results,
  };
}
