import { AgentContext } from '../agents.config';
import {
  Contract,
  Wallet,
  formatUnits,
  getAddress,
  parseUnits,
} from 'ethers';
import {
  EVM_CONTRACTS,
  getBlockscoutTxUrl,
  getEvmProvider,
} from '../../../config/evm-network.config';

interface SwapQuoteResult {
  fromToken: string;
  toToken: string;
  amountIn: string;
  expectedOutput: string;
  minOutput: string;
  priceImpact: string;
  route: string[];
}

interface ExecuteSwapResult {
  success: boolean;
  txHash: string;
  explorerUrl: string;
}

const TOKENS = {
  INJ: {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    decimals: 18,
    isNative: true,
  },
  WINJ: {
    address: EVM_CONTRACTS.wInjAddress,
    decimals: 18,
    isNative: false,
  },
  USDT: {
    address: EVM_CONTRACTS.usdtAddress,
    decimals: 6,
    isNative: false,
  },
  USDC: {
    address: EVM_CONTRACTS.usdcAddress,
    decimals: 6,
    isNative: false,
  },
} as const;

const ROUTER_ADDRESS = EVM_CONTRACTS.routerAddress;
const ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, tuple(address from,address to,bool stable)[] routes) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, tuple(address from,address to,bool stable)[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, tuple(address from,address to,bool stable)[] routes, address to, uint256 deadline) payable returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, tuple(address from,address to,bool stable)[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
];
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

type SupportedToken = keyof typeof TOKENS;

function getToken(symbol: string) {
  const token = TOKENS[symbol.toUpperCase() as SupportedToken];
  if (!token) {
    throw new Error(`Unsupported token: ${symbol}`);
  }
  return token;
}

function isNative(symbol: string): boolean {
  return getToken(symbol).isNative;
}

function getSwapRoutes(fromToken: string, toToken: string) {
  const from = isNative(fromToken) ? TOKENS.WINJ.address : getToken(fromToken).address;
  const to = isNative(toToken) ? TOKENS.WINJ.address : getToken(toToken).address;
  const stable = ['USDT:USDC', 'USDC:USDT'].includes(`${fromToken.toUpperCase()}:${toToken.toUpperCase()}`);
  return [{ from: getAddress(from), to: getAddress(to), stable }];
}

async function checkAllowance(
  provider: ReturnType<typeof getEvmProvider>,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
): Promise<bigint> {
  const token = new Contract(tokenAddress, ERC20_ABI, provider);
  return (await token.allowance(ownerAddress, spenderAddress)) as bigint;
}

async function approveToken(
  wallet: Wallet,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
): Promise<void> {
  const token = new Contract(tokenAddress, ERC20_ABI, wallet);
  const tx = await token.approve(spenderAddress, amount);
  await tx.wait();
}

export async function getSwapQuote(
  context: AgentContext,
  fromToken: string,
  toToken: string,
  amount: string,
  slippage: number = 0.5,
): Promise<SwapQuoteResult> {
  const provider = getEvmProvider();
  const router = new Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
  const fromInfo = getToken(fromToken);
  const toInfo = getToken(toToken);
  const amountIn = parseUnits(amount, fromInfo.decimals);
  const routes = getSwapRoutes(fromToken, toToken);
  const amounts = (await router.getAmountsOut(amountIn, routes)) as bigint[];
  const expectedOutput = amounts[amounts.length - 1];
  const minOutput = expectedOutput - (expectedOutput * BigInt(Math.round(slippage * 100))) / 10000n;

  return {
    fromToken,
    toToken,
    amountIn: amount,
    expectedOutput: formatUnits(expectedOutput, toInfo.decimals),
    minOutput: formatUnits(minOutput, toInfo.decimals),
    priceImpact: '0.1',
    route: routes.map((route) => `${fromToken.toUpperCase()} → ${toToken.toUpperCase()} (${route.stable ? 'stable' : 'volatile'})`),
  };
}

export async function executeSwap(
  context: AgentContext,
  fromToken: string,
  toToken: string,
  amount: string,
  slippage: number = 0.5,
  expectedOutput?: string,
): Promise<ExecuteSwapResult> {
  if (!context.privateKey || !context.isSandbox || !context.sandboxAddress) {
    throw new Error('Swap execution requires a backend-managed sandbox wallet.');
  }

  const provider = getEvmProvider();
  const wallet = new Wallet(context.privateKey, provider);
  const router = new Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);
  const fromInfo = getToken(fromToken);
  const toInfo = getToken(toToken);
  const amountIn = parseUnits(amount, fromInfo.decimals);
  const quote = await getSwapQuote(context, fromToken, toToken, amount, slippage);
  const minOutput = parseUnits(expectedOutput || quote.minOutput, toInfo.decimals);
  const routes = getSwapRoutes(fromToken, toToken);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  let txHash = '';

  if (isNative(fromToken)) {
    const tx = await router.swapExactETHForTokens(
      minOutput,
      routes,
      getAddress(context.sandboxAddress),
      deadline,
      { value: amountIn },
    );
    await tx.wait();
    txHash = tx.hash;
  } else if (isNative(toToken)) {
    const allowance = await checkAllowance(provider, fromInfo.address, context.sandboxAddress, ROUTER_ADDRESS);
    if (allowance < amountIn) {
      await approveToken(wallet, fromInfo.address, ROUTER_ADDRESS, amountIn * 2n);
    }
    const tx = await router.swapExactTokensForETH(
      amountIn,
      minOutput,
      routes,
      getAddress(context.sandboxAddress),
      deadline,
    );
    await tx.wait();
    txHash = tx.hash;
  } else {
    const allowance = await checkAllowance(provider, fromInfo.address, context.sandboxAddress, ROUTER_ADDRESS);
    if (allowance < amountIn) {
      await approveToken(wallet, fromInfo.address, ROUTER_ADDRESS, amountIn * 2n);
    }
    const tx = await router.swapExactTokensForTokens(
      amountIn,
      minOutput,
      routes,
      getAddress(context.sandboxAddress),
      deadline,
    );
    await tx.wait();
    txHash = tx.hash;
  }

  return {
    success: true,
    txHash,
    explorerUrl: getBlockscoutTxUrl(txHash),
  };
}
