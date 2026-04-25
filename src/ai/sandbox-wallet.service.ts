import { Injectable } from '@nestjs/common';
import { Contract, Wallet, formatEther, formatUnits, getAddress, parseEther } from 'ethers';
import type { AgentSessionRecord } from './agent-session.service';
import {
  EVM_CONTRACTS,
  getBlockscoutTxUrl,
  getEvmProvider,
} from '../config/evm-network.config';

const TOKENS = {
  USDT: {
    address: EVM_CONTRACTS.usdtAddress,
    decimals: 6,
  },
  USDC: {
    address: EVM_CONTRACTS.usdcAddress,
    decimals: 6,
  },
} as const;

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

@Injectable()
export class SandboxWalletService {
  async sweepSandbox(session: AgentSessionRecord, privateKey: string, recipientAddress: string) {
    if (!session.sandboxAddress) {
      throw new Error('Sandbox address not found for this session.');
    }

    const recipient = getAddress(recipientAddress);
    const provider = getEvmProvider();
    const wallet = new Wallet(privateKey, provider);
    const sandboxAddress = getAddress(session.sandboxAddress);

    const usdt = new Contract(TOKENS.USDT.address, ERC20_ABI, wallet);
    const usdc = new Contract(TOKENS.USDC.address, ERC20_ABI, wallet);

    const [injBalance, usdtBalance, usdcBalance] = await Promise.all([
      provider.getBalance(sandboxAddress),
      usdt.balanceOf(sandboxAddress).catch(() => 0n),
      usdc.balanceOf(sandboxAddress).catch(() => 0n),
    ]);

    const transfers: Array<{
      symbol: 'INJ' | 'USDT' | 'USDC';
      amount: string;
      txHash: string;
      explorerUrl: string;
    }> = [];

    if (usdtBalance > 0n) {
      const tx = await usdt.transfer(recipient, usdtBalance);
      await tx.wait();
      transfers.push({
        symbol: 'USDT',
        amount: formatUnits(usdtBalance, TOKENS.USDT.decimals),
        txHash: tx.hash,
        explorerUrl: getBlockscoutTxUrl(tx.hash),
      });
    }

    if (usdcBalance > 0n) {
      const tx = await usdc.transfer(recipient, usdcBalance);
      await tx.wait();
      transfers.push({
        symbol: 'USDC',
        amount: formatUnits(usdcBalance, TOKENS.USDC.decimals),
        txHash: tx.hash,
        explorerUrl: getBlockscoutTxUrl(tx.hash),
      });
    }

    const reserveForGas = parseEther('0.001');
    if (injBalance > reserveForGas) {
      const amount = injBalance - reserveForGas;
      const tx = await wallet.sendTransaction({
        to: recipient,
        value: amount,
      });
      await tx.wait();
      transfers.push({
        symbol: 'INJ',
        amount: formatEther(amount),
        txHash: tx.hash,
        explorerUrl: getBlockscoutTxUrl(tx.hash),
      });
    }

    return {
      sandboxAddress,
      recipientAddress: recipient,
      transfers,
      empty: transfers.length === 0,
      balancesBefore: {
        INJ: formatEther(injBalance),
        USDT: formatUnits(usdtBalance, TOKENS.USDT.decimals),
        USDC: formatUnits(usdcBalance, TOKENS.USDC.decimals),
      },
    };
  }
}
