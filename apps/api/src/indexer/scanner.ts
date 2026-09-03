import { createPublicClient, http, type Address, type Hex } from "viem";
import { createDatabase, type Database } from "../db/database";
import { decodePayChadEvent, type PayChadDomainEvent, type RawBlockchainLog } from "./events";
import { persistPayChadEvents } from "./persist";

export interface ScannerRpc {
  getBlockNumber(): Promise<bigint>;
  getBlock(args: { blockNumber: bigint }): Promise<{ number: bigint | null; hash: Hex | null }>;
  getLogs(args: { address: Address; fromBlock: bigint; toBlock: bigint }): Promise<readonly RawBlockchainLog[]>;
}

export interface ScannerCheckpoint {
  chainId: bigint;
  contractAddress: Address;
  lastProcessedBlock: bigint;
  lastProcessedBlockHash: Hex;
}

export interface CheckpointStore {
  get(chainId: bigint, contractAddress: Address): Promise<ScannerCheckpoint | null>;
  save(checkpoint: ScannerCheckpoint): Promise<void>;
}

export interface EventPersister {
  persist(events: readonly PayChadDomainEvent[]): Promise<void>;
}

export type ScannerConfig = {
  chainId: bigint;
  contractAddress: Address;
  rpcUrl: string;
  startBlock: bigint;
  confirmations: bigint;
  batchSize: bigint;
};

export type ScanResult = { fromBlock: bigint; toBlock: bigint; logCount: number };

export class ReorgDetectedError extends Error {
  constructor(message: string) { super(message); this.name = "ReorgDetectedError"; }
}

export const DEFAULT_CONFIRMATIONS = 12n;
export const DEFAULT_BATCH_SIZE = 500n;
export const DEFAULT_POLL_INTERVAL_MS = 4_000;
export const DEFAULT_MAX_RETRIES = 5;

export function createScannerConfig(env: NodeJS.ProcessEnv = process.env): ScannerConfig {
  return {
    chainId: parsePositiveBigInt(env.INDEXER_CHAIN_ID, "INDEXER_CHAIN_ID"),
    contractAddress: parseAddress(env.PAYCHAD_PAYROLL_CONTRACT_ADDRESS, "PAYCHAD_PAYROLL_CONTRACT_ADDRESS"),
    rpcUrl: parseRequired(env.INDEXER_RPC_URL, "INDEXER_RPC_URL"),
    startBlock: parseNonNegativeBigInt(env.INDEXER_START_BLOCK, "INDEXER_START_BLOCK"),
    confirmations: parseNonNegativeBigInt(env.INDEXER_CONFIRMATIONS ?? DEFAULT_CONFIRMATIONS.toString(), "INDEXER_CONFIRMATIONS"),
    batchSize: parsePositiveBigInt(env.INDEXER_BATCH_SIZE ?? DEFAULT_BATCH_SIZE.toString(), "INDEXER_BATCH_SIZE"),
  };
}

export function createMonadScannerRpc(config: ScannerConfig): ScannerRpc {
  const client = createPublicClient({ transport: http(config.rpcUrl) });
  return {
    getBlockNumber: () => client.getBlockNumber(),
    getBlock: async ({ blockNumber }) => {
      const block = await client.getBlock({ blockNumber });
      return { number: block.number, hash: block.hash };
    },
    getLogs: async ({ address, fromBlock, toBlock }) => {
      const logs = await client.getLogs({ address, fromBlock, toBlock });
      return logs.map((log) => ({
        chainId: config.chainId,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        logIndex: log.logIndex,
        address: log.address,
        topics: log.topics,
        data: log.data,
      }));
    },
  };
}

export function createDatabaseCheckpointStore(db: Database): CheckpointStore {
  return {
    async get(chainId, contractAddress) {
      const [row] = await db<{ last_processed_block: string; last_processed_block_hash: Hex }[]>`
        SELECT last_processed_block::text, last_processed_block_hash
        FROM indexer_checkpoints
        WHERE chain_id = ${chainId.toString()} AND contract_address = ${contractAddress}
      `;
      if (!row) return null;
      return { chainId, contractAddress, lastProcessedBlock: BigInt(row.last_processed_block), lastProcessedBlockHash: row.last_processed_block_hash };
    },
    async save(checkpoint) {
      await db`
        INSERT INTO indexer_checkpoints (chain_id, contract_address, last_processed_block, last_processed_block_hash, updated_at)
        VALUES (${checkpoint.chainId.toString()}, ${checkpoint.contractAddress}, ${checkpoint.lastProcessedBlock.toString()}, ${checkpoint.lastProcessedBlockHash}, now())
        ON CONFLICT (chain_id, contract_address) DO UPDATE
        SET last_processed_block = EXCLUDED.last_processed_block,
            last_processed_block_hash = EXCLUDED.last_processed_block_hash,
            updated_at = now()
      `;
    },
  };
}

export function createDatabaseEventPersister(db: Database): EventPersister {
  return { persist: (events) => persistPayChadEvents(db, events) };
}

export async function scanOnce(rpc: ScannerRpc, persister: EventPersister, checkpoints: CheckpointStore, config: ScannerConfig): Promise<ScanResult | null> {
  const checkpoint = await checkpoints.get(config.chainId, config.contractAddress);
  if (checkpoint) await assertCheckpointCanonical(rpc, checkpoint);

  const latest = await rpc.getBlockNumber();
  if (latest < config.confirmations) return null;
  const safeHead = latest - config.confirmations;
  const fromBlock = checkpoint ? checkpoint.lastProcessedBlock + 1n : config.startBlock;
  if (fromBlock > safeHead) return null;
  const toBlock = fromBlock + config.batchSize - 1n < safeHead ? fromBlock + config.batchSize - 1n : safeHead;

  const boundaryBefore = await rpc.getBlock({ blockNumber: toBlock });
  if (boundaryBefore.number !== toBlock || !boundaryBefore.hash) throw new Error(`RPC returned incomplete boundary block ${toBlock}`);
  const logs = await rpc.getLogs({ address: config.contractAddress, fromBlock, toBlock });
  const boundaryAfter = await rpc.getBlock({ blockNumber: toBlock });
  if (boundaryAfter.hash !== boundaryBefore.hash) throw new ReorgDetectedError(`Scan boundary block ${toBlock} changed while reading logs`);

  const ordered = [...logs].sort(compareRawLogs);
  for (const log of ordered) validateLog(log, config, fromBlock, toBlock);
  await assertEventBlocksCanonical(rpc, ordered);
  const events = ordered.map(decodePayChadEvent);
  await persister.persist(events);
  await checkpoints.save({ chainId: config.chainId, contractAddress: config.contractAddress, lastProcessedBlock: toBlock, lastProcessedBlockHash: boundaryAfter.hash });
  return { fromBlock, toBlock, logCount: logs.length };
}

function compareRawLogs(a: RawBlockchainLog, b: RawBlockchainLog): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  const aTx = a.transactionIndex ?? Number.MAX_SAFE_INTEGER;
  const bTx = b.transactionIndex ?? Number.MAX_SAFE_INTEGER;
  if (aTx !== bTx) return aTx - bTx;
  const aLog = BigInt(a.logIndex);
  const bLog = BigInt(b.logIndex);
  return aLog === bLog ? 0 : aLog < bLog ? -1 : 1;
}

async function assertCheckpointCanonical(rpc: ScannerRpc, checkpoint: ScannerCheckpoint): Promise<void> {
  const block = await rpc.getBlock({ blockNumber: checkpoint.lastProcessedBlock });
  if (block.hash !== checkpoint.lastProcessedBlockHash) throw new ReorgDetectedError(`Checkpoint block ${checkpoint.lastProcessedBlock} hash changed from ${checkpoint.lastProcessedBlockHash} to ${block.hash ?? "null"}`);
}

async function assertEventBlocksCanonical(rpc: ScannerRpc, logs: readonly RawBlockchainLog[]): Promise<void> {
  const blocks = [...new Set(logs.map((log) => log.blockNumber.toString()))].map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  for (const blockNumber of blocks) {
    const block = await rpc.getBlock({ blockNumber });
    const expected = logs.find((log) => log.blockNumber === blockNumber)?.blockHash;
    if (!block.hash || block.hash !== expected) throw new ReorgDetectedError(`Event block ${blockNumber} hash is no longer canonical`);
  }
}

function validateLog(log: RawBlockchainLog, config: ScannerConfig, fromBlock: bigint, toBlock: bigint): void {
  if (log.chainId !== config.chainId) throw new Error(`Unexpected log chain ID ${log.chainId}`);
  if (log.address.toLowerCase() !== config.contractAddress.toLowerCase()) throw new Error(`Unexpected event contract ${log.address}`);
  if (log.blockNumber < fromBlock || log.blockNumber > toBlock) throw new Error(`Log block ${log.blockNumber} is outside scanner bounds`);
  if (!log.blockHash || !log.transactionHash || log.transactionIndex == null) throw new Error("RPC log is missing canonical provenance metadata");
}

function parseRequired(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function parsePositiveBigInt(value: string | undefined, name: string): bigint {
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} must be a positive decimal integer`);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${name} must be greater than zero`);
  return parsed;
}

function parseNonNegativeBigInt(value: string | undefined, name: string): bigint {
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative decimal integer`);
  return BigInt(value);
}

function parseAddress(value: string | undefined, name: string): Address {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be a 20-byte hex address`);
  return value as Address;
}

export async function runIndexer(rpc: ScannerRpc, persister: EventPersister, checkpoints: CheckpointStore, config: ScannerConfig, options: { signal?: AbortSignal; pollIntervalMs?: number; maxRetries?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<void> {
  const signal = options.signal ?? new AbortController().signal;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  while (!signal.aborted) {
    let attempt = 0;
    while (!signal.aborted) {
      try {
        await scanOnce(rpc, persister, checkpoints, config);
        break;
      } catch (error) {
        if (error instanceof ReorgDetectedError) throw error;
        attempt += 1;
        if (attempt > maxRetries) throw error;
        await sleep(backoffMs(attempt));
      }
    }
    if (!signal.aborted) await sleep(pollIntervalMs);
  }
}

export function backoffMs(attempt: number): number { return Math.min(30_000, 500 * 2 ** Math.max(0, attempt - 1)); }

export async function runConfiguredIndexer(signal: AbortSignal): Promise<void> {
  const config = createScannerConfig();
  const db = createDatabase();
  try {
    await db`SELECT 1`;
    await runIndexer(createMonadScannerRpc(config), createDatabaseEventPersister(db), createDatabaseCheckpointStore(db), config, { signal });
  } finally {
    await db.end({ timeout: 5 });
  }
}
