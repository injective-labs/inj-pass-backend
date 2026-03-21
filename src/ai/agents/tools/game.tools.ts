/**
 * Game Tools
 * Implementation for play_hash_mahjong and play_hash_mahjong_multi
 */

import { AgentContext } from '../agents.config';

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

// Hash Mahjong game contract address
const HM_GAME_ADDRESS = '0x1234567890123456789012345678901234567890';
const HM_PLAY_COST = '0.000001'; // INJ cost per round

// Mahjong tiles and win rules (simplified - actual implementation in frontend)
const TILES = ['🀀', '🀁', '🀂', '🀃', '🀄', '🀅', '🀆', '🀇', '🀈', '🀉'];
const WIN_RULES = [
  { name: 'Ping An', payout: '1.5x' },
  { name: 'Yi Bin', payout: '2x' },
  { name: 'Fa Cai', payout: '3x' },
];

// Derive tiles from tx hash (simplified)
function deriveTilesFromHash(txHash: string): string[] {
  const hash = txHash.replace(/^0x/, '');
  const tiles: string[] = [];

  for (let i = 0; i < 10; i++) {
    const charIndex = parseInt(hash.slice(i * 2, i * 2 + 2), 16) % TILES.length;
    tiles.push(TILES[charIndex]);
  }

  return tiles;
}

// Check if tiles win (simplified - actual logic in contract)
function checkWin(tiles: string[]): { win: boolean; rule: string | null } {
  // Simplified win check - in production, match against 18 win rules
  const hashSum = tiles.reduce((sum, t) => sum + TILES.indexOf(t), 0);
  const isWin = hashSum % 7 === 0;
  const rule = isWin ? WIN_RULES[hashSum % WIN_RULES.length].name : null;

  return { win: isWin, rule };
}

export async function playHashMahjong(context: AgentContext): Promise<HashMahjongResult> {
  const fromAddress = context.isSandbox ? context.sandboxAddress : context.walletAddress;
  const pk = context.isSandbox ? context.privateKey : context.privateKey;

  console.log('[game.playHashMahjong] Playing from:', fromAddress);

  // TODO: Implement actual game play
  // 1. Send transaction with HM_PLAY_COST to game contract
  // 2. Derive tiles from tx hash
  // 3. Check win conditions

  // Placeholder
  const placeholderHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
  const tiles = deriveTilesFromHash(placeholderHash);
  const { win, rule } = checkWin(tiles);

  return {
    txHash: placeholderHash,
    tiles: tiles.join(''),
    seed10: placeholderHash.slice(0, 20),
    win,
    rule,
    explorerUrl: `https://blockscout.injective.network/tx/${placeholderHash}`,
  };
}

export async function playHashMahjongMulti(
  context: AgentContext,
  rounds: number = 5,
): Promise<MultiMahjongResult> {
  // Cap at 20 rounds
  const actualRounds = Math.min(Math.max(1, rounds), 20);
  const fromAddress = context.isSandbox ? context.sandboxAddress : context.walletAddress;
  const pk = context.isSandbox ? context.privateKey : context.privateKey;

  console.log('[game.playHashMahjongMulti] Playing', actualRounds, 'rounds from:', fromAddress);

  // TODO: Implement actual multi-round play

  // Placeholder
  const results: MultiMahjongResult['results'] = [];
  let wins = 0;

  for (let i = 0; i < actualRounds; i++) {
    const placeholderHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
    const tiles = deriveTilesFromHash(placeholderHash);
    const { win, rule } = checkWin(tiles);

    if (win) wins++;

    results.push({
      round: i + 1,
      txHash: placeholderHash,
      tiles: tiles.join(''),
      win,
      rule,
    });
  }

  return {
    totalRounds: actualRounds,
    wins,
    losses: actualRounds - wins,
    winRate: ((wins / actualRounds) * 100).toFixed(1) + '%',
    bestRule: results.find(r => r.win)?.rule || null,
    results,
  };
}
