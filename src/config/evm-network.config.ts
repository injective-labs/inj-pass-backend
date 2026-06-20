import { JsonRpcProvider, getAddress } from 'ethers';

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parseChainId(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1776;
}

function readChainId() {
  return parseChainId(readEnv('INJECTIVE_EVM_CHAIN_ID', 'WORKER_STATIC_CHAIN_ID'));
}

function isTestnet() {
  return readChainId() === 1439;
}

// Keep this aligned with old frontend mainnet constants by default.
export const EVM_NETWORK = {
  get rpcUrl() {
    return readEnv('INJECTIVE_EVM_RPC', 'WORKER_RPC_URL') || 'https://sentry.evm-rpc.injective.network/';
  },
  get chainId() {
    return readChainId();
  },
  get networkName() {
    return isTestnet() ? 'Injective EVM Testnet' : 'Injective EVM Mainnet';
  },
  get blockscoutBaseUrl() {
    return isTestnet()
      ? 'https://testnet.blockscout.injective.network'
      : 'https://blockscout.injective.network';
  },
  get blockscoutApiBaseUrl() {
    return isTestnet()
      ? 'https://testnet.blockscout-api.injective.network/api/v2'
      : 'https://blockscout.injective.network/api/v2';
  },
} as const;

export const EVM_CONTRACTS = {
  routerAddress: getAddress(
    '0xC7247df0e97353D676d78f1cc55D3CE39eE32bE1',
  ),
  hashMahjongAddress: getAddress(
    '0x6cd6592b7d2a9b1e59aa60a6138434d2fe4cd062',
  ),
  wInjAddress: getAddress(
    '0x0000000088827d2d103ee2d9A6b781773AE03FfB',
  ),
  usdtAddress: getAddress(
    '0x88f7F2b685F9692caf8c478f5BADF09eE9B1Cc13',
  ),
  usdcAddress: getAddress(
    '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
  ),
} as const;

export const HASH_MAHJONG_CONFIG = {
  playCostInj: '0.000001',
} as const;

export function getEvmProvider(): JsonRpcProvider {
  return new JsonRpcProvider(
    EVM_NETWORK.rpcUrl,
    EVM_NETWORK.chainId,
    { staticNetwork: true },
  );
}

export function getBlockscoutTxUrl(txHash: string): string {
  return `${EVM_NETWORK.blockscoutBaseUrl}/tx/${txHash}`;
}

export function getBlockscoutAddressTxApiUrl(address: string): string {
  return `${EVM_NETWORK.blockscoutApiBaseUrl}/addresses/${address}/transactions`;
}
