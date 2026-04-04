import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { JsonRpcProvider, Contract, EventLog } from 'ethers';
import { chanceManagerAbi } from './abi/chance-manager.abi';

const RPC_URL = process.env.WORKER_RPC_URL ?? '';
const CONTRACT_ADDRESS = process.env.CHANCE_CONTRACT_ADDRESS ?? '';
const BACKEND_API_URL = process.env.WORKER_BACKEND_API_URL ?? '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? '';
const CHAIN_ID = process.env.WORKER_CHAIN_ID ?? 'injective';
const STATIC_CHAIN_ID = Number(process.env.WORKER_STATIC_CHAIN_ID ?? '1776');
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? '8000');
const BLOCK_CONFIRMATIONS = Number(process.env.WORKER_BLOCK_CONFIRMATIONS ?? '2');
const MAX_BLOCK_RANGE = Number(process.env.WORKER_MAX_BLOCK_RANGE ?? '1200');
const RECEIPT_FALLBACK_BLOCK_RANGE = Number(process.env.WORKER_RECEIPT_FALLBACK_BLOCK_RANGE ?? '60');
const START_BLOCK = Number(process.env.WORKER_START_BLOCK ?? '0');
const AUTO_CATCH_UP = String(process.env.WORKER_AUTO_CATCH_UP ?? 'true').toLowerCase() !== 'false';
const AUTO_CATCH_UP_WINDOW = Number(process.env.WORKER_AUTO_CATCH_UP_WINDOW ?? '2000');
const MAX_LAG_BEFORE_RESET = Number(process.env.WORKER_MAX_LAG_BEFORE_RESET ?? '500000');
const STATE_FILE = process.env.WORKER_STATE_FILE
  ? path.resolve(process.cwd(), process.env.WORKER_STATE_FILE)
  : path.resolve(__dirname, '../../.chance-worker-state.json');

if (!RPC_URL) throw new Error('WORKER_RPC_URL is required');
if (!CONTRACT_ADDRESS) throw new Error('CHANCE_CONTRACT_ADDRESS is required');
if (!BACKEND_API_URL) throw new Error('WORKER_BACKEND_API_URL is required');
if (!ADMIN_API_KEY) throw new Error('ADMIN_API_KEY is required');

const provider = Number.isFinite(STATIC_CHAIN_ID) && STATIC_CHAIN_ID > 0
  ? new JsonRpcProvider(RPC_URL, STATIC_CHAIN_ID, { staticNetwork: true })
  : new JsonRpcProvider(RPC_URL);
const contract = new Contract(CONTRACT_ADDRESS, chanceManagerAbi, provider);
const contractAddressLower = CONTRACT_ADDRESS.toLowerCase();
const chancePurchasedTopic = contract.interface.getEvent('ChancePurchased')?.topicHash;

let running = true;
let forceReceiptFallback = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WorkerState = {
  lastProcessedBlock: number;
};

function loadState(): WorkerState {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WorkerState>;
    return {
      lastProcessedBlock: Number.isFinite(Number(parsed.lastProcessedBlock))
        ? Number(parsed.lastProcessedBlock)
        : 0,
    };
  } catch {
    return { lastProcessedBlock: 0 };
  }
}

function saveState(state: WorkerState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function mapPlanIdToProductId(planId: bigint): string {
  const value = Number(planId);
  if (value === 1) return 'go';
  if (value === 2) return 'pro';
  if (value === 3) return 'max';
  return `plan-${value}`;
}

async function postPurchase(payload: {
  txHash: string;
  walletAddress: string;
  productId: string;
  chanceAmount: number;
  cooldownEndsAt: number;
  blockNumber: number;
  logIndex: number;
}) {
  const endpoint = `${BACKEND_API_URL.replace(/\/$/, '')}/api/admin/chance/purchase-webhook`;
  const res = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({
      ...payload,
      chainId: CHAIN_ID,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function processRange(fromBlock: number, toBlock: number) {
  if (forceReceiptFallback) {
    await processRangeFromReceipts(fromBlock, toBlock);
    return;
  }

  try {
    const events = await contract.queryFilter(contract.filters.ChancePurchased(), fromBlock, toBlock);

    if (events.length === 0) {
      return;
    }

    for (const event of events) {
      const log = event as EventLog;
      const args = log.args;
      const buyer = String(args.buyer).toLowerCase();
      const planId = BigInt(args.planId);
      const chances = Number(args.chances);
      const cooldownEndsAt = Number(args.cooldownEndsAt);

      const result = await postPurchase({
        txHash: log.transactionHash.toLowerCase(),
        walletAddress: buyer,
        productId: mapPlanIdToProductId(planId),
        chanceAmount: chances,
        cooldownEndsAt,
        blockNumber: Number(log.blockNumber),
        logIndex: Number(log.index),
      });

      console.log(`[chance-worker] processed tx=${log.transactionHash} buyer=${buyer} plan=${planId} chances=${chances}`, result);
    }
  } catch (error) {
    const maybe = error as { error?: { code?: number; message?: string }; shortMessage?: string; message?: string };
    const code = maybe?.error?.code;
    const message = (maybe?.error?.message ?? maybe?.shortMessage ?? maybe?.message ?? '').toLowerCase();

    // Some Injective RPCs respond like: { code: -32000, message: "block bloom event is not found" }
    if (code === -32000 && message.includes('block bloom event is not found')) {
      return;
    }

    // Some providers do not support eth_getLogs; fallback to scanning tx receipts.
    if (code === -32600 || message.includes('method not supported')) {
      forceReceiptFallback = true;
      console.warn('[chance-worker] eth_getLogs unsupported, switching to receipt fallback mode');
      await processRangeFromReceipts(fromBlock, toBlock);
      return;
    }

    throw error;
  }
}

async function processRangeFromReceipts(fromBlock: number, toBlock: number) {
  if (!chancePurchasedTopic) {
    throw new Error('ChancePurchased topic hash missing in ABI');
  }

  for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += 1) {
    const blockHex = `0x${blockNumber.toString(16)}`;
    const block = await provider.send('eth_getBlockByNumber', [blockHex, false]) as
      | { transactions?: string[] }
      | null;

    const txHashes = Array.isArray(block?.transactions) ? block.transactions : [];
    if (txHashes.length === 0) continue;

    for (const txHash of txHashes) {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || !Array.isArray(receipt.logs) || receipt.logs.length === 0) continue;

      for (const log of receipt.logs) {
        if (String(log.address).toLowerCase() !== contractAddressLower) continue;
        if (!Array.isArray(log.topics) || log.topics[0] !== chancePurchasedTopic) continue;

        const parsed = contract.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (!parsed) continue;

        const buyer = String(parsed.args.buyer).toLowerCase();
        const planId = BigInt(parsed.args.planId);
        const chances = Number(parsed.args.chances);
        const cooldownEndsAt = Number(parsed.args.cooldownEndsAt);

        const result = await postPurchase({
          txHash: String(receipt.hash).toLowerCase(),
          walletAddress: buyer,
          productId: mapPlanIdToProductId(planId),
          chanceAmount: chances,
          cooldownEndsAt,
          blockNumber,
          logIndex: Number(log.index),
        });

        console.log(`[chance-worker] processed tx=${receipt.hash} buyer=${buyer} plan=${planId} chances=${chances}`, result);
      }
    }
  }
}

async function bootstrap() {
  let state = loadState();
  const current = await provider.getBlockNumber();
  const target = Math.max(0, current - BLOCK_CONFIRMATIONS);

  if (state.lastProcessedBlock <= 0) {
    const fallbackStart = START_BLOCK > 0 ? START_BLOCK : Math.max(0, target - AUTO_CATCH_UP_WINDOW);
    state = { lastProcessedBlock: fallbackStart };
    saveState(state);
  } else if (AUTO_CATCH_UP && START_BLOCK <= 0) {
    const lag = Math.max(0, target - state.lastProcessedBlock);
    if (lag > MAX_LAG_BEFORE_RESET) {
      const catchUpStart = Math.max(0, target - AUTO_CATCH_UP_WINDOW);
      console.warn('[chance-worker] stale cursor detected, auto catch-up enabled', {
        previous: state.lastProcessedBlock,
        target,
        lag,
        resetTo: catchUpStart,
      });
      state = { lastProcessedBlock: catchUpStart };
      saveState(state);
    }
  }

  console.log('[chance-worker] started', {
    rpc: RPC_URL,
    contract: CONTRACT_ADDRESS,
    lastProcessedBlock: state.lastProcessedBlock,
    chainId: CHAIN_ID,
  });

  while (running) {
    try {
      const latest = await provider.getBlockNumber();
      const target = Math.max(0, latest - BLOCK_CONFIRMATIONS);

      if (target <= state.lastProcessedBlock) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      let fromBlock = state.lastProcessedBlock + 1;
      while (fromBlock <= target) {
        const batchRange = forceReceiptFallback
          ? RECEIPT_FALLBACK_BLOCK_RANGE
          : MAX_BLOCK_RANGE;
        const toBlock = Math.min(fromBlock + batchRange - 1, target);
        await processRange(fromBlock, toBlock);
        state.lastProcessedBlock = toBlock;
        saveState(state);
        fromBlock = toBlock + 1;
      }
    } catch (error) {
      console.error('[chance-worker] loop error', error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

process.on('SIGINT', () => {
  running = false;
});

process.on('SIGTERM', () => {
  running = false;
});

bootstrap().catch((error) => {
  console.error('[chance-worker] fatal', error);
  process.exit(1);
});
