/**
 * Wallet Tools
 * Implementation for get_wallet_info, get_balance, get_tx_history, send_token
 */

import { ConfigService } from '@nestjs/config';
import { AgentContext } from '../agents.config';

interface WalletInfoResult {
  address: string;
  network: string;
  chainId: number;
  note?: string;
}

interface BalanceResult {
  INJ: string;
  USDT: string;
  USDC: string;
}

interface TxHistoryResult {
  hash: string;
  from: string;
  to: string;
  value: string;
  token: string;
  timestamp: number;
  status: 'success' | 'failed';
}

interface SendTokenResult {
  success: boolean;
  txHash: string;
  explorerUrl: string;
}

// Token addresses on Injective EVM
const TOKENS = {
  INJ: '0xe79d3fbb5f93b4e4c3007b2d5d0e2e8f3c5f4c0', // Native
  USDT: '0x4Ee81167c48Bc996eb1aE131203321C3b5d808bF',
  USDC: '0xaE721B5Fb54EB0B536a3445A46F7a19A25B24fEe',
};

// RPC URL
const getRpcUrl = () => {
  return (
    process.env.INJECTIVE_EVM_RPC || 'https://injective-1.public.blastapi.io'
  );
};

export async function getWalletInfo(
  context: AgentContext,
): Promise<WalletInfoResult> {
  const activeAddr = context.isSandbox
    ? context.sandboxAddress
    : context.walletAddress;

  if (!activeAddr) {
    return {
      address: '0x0000000000000000000000000000000000000000',
      network: 'Injective EVM Mainnet',
      chainId: 1776,
      note: 'No wallet address available',
    };
  }

  return {
    address: activeAddr,
    network: 'Injective EVM Mainnet',
    chainId: 1776,
    ...(context.isSandbox
      ? { note: "SANDBOX wallet — not the user's real wallet" }
      : {}),
  };
}

export async function getBalance(
  context: AgentContext,
): Promise<BalanceResult> {
  const activeAddr = context.isSandbox
    ? context.sandboxAddress
    : context.walletAddress;

  try {
    const response = await fetch(getRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [activeAddr, 'latest'],
      }),
    });

    const result = await response.json();
    const injBalance = result.result ? parseInt(result.result, 16) / 1e18 : 0;

    // For ERC-20 balances, we'd need to call contract read methods
    // Simplified for now - in production, use viem/batch calls

    return {
      INJ: injBalance.toFixed(6),
      USDT: '0', // TODO: Implement ERC-20 balance check
      USDC: '0', // TODO: Implement ERC-20 balance check
    };
  } catch (error) {
    console.error('[wallet.getBalance] Error:', error);
    return { INJ: '0', USDT: '0', USDC: '0' };
  }
}

export async function getTxHistory(
  context: AgentContext,
  limit: number = 10,
): Promise<TxHistoryResult[]> {
  const activeAddr = context.isSandbox
    ? context.sandboxAddress
    : context.walletAddress;

  // In production, query Blockscout API or indexer
  // Simplified for now
  console.log(
    '[wallet.getTxHistory] Getting tx history for:',
    activeAddr,
    'limit:',
    limit,
  );

  return []; // TODO: Implement
}

export async function sendToken(
  context: AgentContext,
  toAddress: string,
  amount: string,
): Promise<SendTokenResult> {
  const pk = context.isSandbox ? context.privateKey : context.privateKey; // Use appropriate key
  const fromAddress = context.isSandbox
    ? context.sandboxAddress
    : context.walletAddress;

  console.log(
    '[wallet.sendToken] Sending',
    amount,
    'INJ from',
    fromAddress,
    'to',
    toAddress,
  );

  // TODO: Implement actual transaction signing and sending
  // This requires:
  // 1. Sign transaction with private key
  // 2. Send via RPC
  // 3. Return txHash

  return {
    success: true,
    txHash: '0x...', // TODO: Implement
    explorerUrl: `https://blockscout.injective.network/tx/0x...`,
  };
}
