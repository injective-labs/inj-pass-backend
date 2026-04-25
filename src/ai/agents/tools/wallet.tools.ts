import { AgentContext } from '../agents.config';
import { Contract, Wallet, formatEther, formatUnits, getAddress, parseEther } from 'ethers';
import {
  EVM_CONTRACTS,
  EVM_NETWORK,
  getBlockscoutAddressTxApiUrl,
  getBlockscoutTxUrl,
  getEvmProvider,
} from '../../../config/evm-network.config';

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
  to: string | null;
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

const TOKENS = {
  USDT: {
    address: EVM_CONTRACTS.usdtAddress,
    decimals: 6,
  },
  USDC: {
    address: EVM_CONTRACTS.usdcAddress,
    decimals: 6,
  },
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

function getActiveAddress(context: AgentContext): string {
  return context.isSandbox
    ? context.sandboxAddress || context.walletAddress
    : context.walletAddress;
}

export async function getWalletInfo(
  context: AgentContext,
): Promise<WalletInfoResult> {
  const activeAddr = getActiveAddress(context);

  return {
    address: activeAddr,
    network: EVM_NETWORK.networkName,
    chainId: EVM_NETWORK.chainId,
    ...(context.isSandbox ? { note: "SANDBOX wallet — not the user's real wallet" } : {}),
  };
}

export async function getBalance(
  context: AgentContext,
): Promise<BalanceResult> {
  const activeAddr = getAddress(getActiveAddress(context));
  const provider = getEvmProvider();

  const [inj, usdt, usdc] = await Promise.all([
    provider.getBalance(activeAddr),
    new Contract(TOKENS.USDT.address, ERC20_ABI, provider).balanceOf(activeAddr).catch(() => 0n),
    new Contract(TOKENS.USDC.address, ERC20_ABI, provider).balanceOf(activeAddr).catch(() => 0n),
  ]);

  return {
    INJ: Number(formatEther(inj)).toFixed(6),
    USDT: Number(formatUnits(usdt, TOKENS.USDT.decimals)).toFixed(6),
    USDC: Number(formatUnits(usdc, TOKENS.USDC.decimals)).toFixed(6),
  };
}

export async function getTxHistory(
  context: AgentContext,
  limit: number = 10,
): Promise<TxHistoryResult[]> {
  const activeAddr = getAddress(getActiveAddress(context));
  const url = getBlockscoutAddressTxApiUrl(activeAddr);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      items?: Array<{
        hash: string;
        from?: { hash?: string };
        to?: { hash?: string } | null;
        value?: string;
        timestamp?: string;
        status?: 'ok' | 'error';
      }>;
    };

    return (payload.items ?? []).slice(0, limit).map((item) => ({
      hash: item.hash,
      from: item.from?.hash ?? '',
      to: item.to?.hash ?? null,
      value: item.value ?? '0',
      token: 'INJ',
      timestamp: item.timestamp ? Math.floor(new Date(item.timestamp).getTime() / 1000) : 0,
      status: item.status === 'error' ? 'failed' : 'success',
    }));
  } catch {
    return [];
  }
}

export async function sendToken(
  context: AgentContext,
  toAddress: string,
  amount: string,
): Promise<SendTokenResult> {
  if (!context.privateKey || !context.isSandbox) {
    throw new Error('Destructive wallet actions require a sandbox wallet managed by the backend.');
  }

  const provider = getEvmProvider();
  const wallet = new Wallet(context.privateKey, provider);
  const tx = await wallet.sendTransaction({
    to: getAddress(toAddress),
    value: parseEther(amount),
  });
  await tx.wait();

  return {
    success: true,
    txHash: tx.hash,
    explorerUrl: getBlockscoutTxUrl(tx.hash),
  };
}
