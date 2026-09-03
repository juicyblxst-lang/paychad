import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { payChadPayrollEvents, type PayChadDomainEvent, type RawBlockchainLog } from "./events";
import { backoffMs, ReorgDetectedError, runIndexer, scanOnce, type CheckpointStore, type EventPersister, type ScannerConfig, type ScannerRpc } from "./scanner";

const CHAIN_ID = 10143n;
const CONTRACT = "0x3333333333333333333333333333333333333333" as Address;
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const HASH = (hex: string): Hex => `0x${hex.repeat(64)}` as Hex;
const TX = (blockNumber: bigint): Hex => `0x${blockNumber.toString(16).padStart(64, "0")}` as Hex;

function companyLog(blockNumber: bigint, logIndex = 0n): RawBlockchainLog {
  return { chainId: CHAIN_ID, blockNumber, blockHash: HASH("a"), transactionHash: TX(blockNumber), transactionIndex: 0, logIndex, address: CONTRACT,
    topics: encodeEventTopics({ abi: payChadPayrollEvents, eventName: "CompanyRegistered", args: [1n, OWNER] }) as readonly Hex[],
    data: encodeAbiParameters([{ type: "string" }], ["PayChad"]) };
}
function config(overrides: Partial<ScannerConfig> = {}): ScannerConfig {
  return { chainId: CHAIN_ID, contractAddress: CONTRACT, rpcUrl: "http://rpc.invalid", startBlock: 10n, confirmations: 0n, batchSize: 10n, ...overrides };
}
class FakeCheckpointStore implements CheckpointStore {
  checkpoint: Awaited<ReturnType<CheckpointStore["get"]>> = null; saves = 0;
  async get(): Promise<Awaited<ReturnType<CheckpointStore["get"]>>> { return this.checkpoint; }
  async save(value: NonNullable<Awaited<ReturnType<CheckpointStore["get"]>>>): Promise<void> { this.checkpoint = value; this.saves += 1; }
}
class FakePersister implements EventPersister {
  events: PayChadDomainEvent[] = []; failures = 0;
  async persist(events: readonly PayChadDomainEvent[]): Promise<void> { if (this.failures > 0) { this.failures -= 1; throw new Error("temporary database failure"); } this.events.push(...events); }
}
class FakeRpc implements ScannerRpc {
  latest = 20n; logs: readonly RawBlockchainLog[] = []; hashes = new Map<bigint, Hex>();
  async getBlockNumber(): Promise<bigint> { return this.latest; }
  async getBlock({ blockNumber }: { blockNumber: bigint }): Promise<{ number: bigint; hash: Hex }> { return { number: blockNumber, hash: this.hashes.get(blockNumber) ?? HASH(blockNumber.toString(16).padStart(2, "0")) }; }
  async getLogs(): Promise<readonly RawBlockchainLog[]> { return this.logs; }
}

describe("scanner", () => {
  it("orders logs and checkpoints only after persistence", async () => {
    const rpc = new FakeRpc(); rpc.hashes.set(11n, HASH("a")); rpc.hashes.set(12n, HASH("a")); rpc.logs = [companyLog(12n, 1n), companyLog(11n)];
    const persister = new FakePersister(); const checkpoints = new FakeCheckpointStore();
    const result = await scanOnce(rpc, persister, checkpoints, config({ batchSize: 20n }));
    expect(result).toMatchObject({ fromBlock: 10n, toBlock: 20n, logCount: 2 });
    expect(persister.events.map((event) => event.blockNumber)).toEqual([11n, 12n]); expect(checkpoints.checkpoint?.lastProcessedBlock).toBe(20n); expect(checkpoints.saves).toBe(1);
  });
  it("does not advance the checkpoint when persistence fails", async () => {
    const rpc = new FakeRpc(); rpc.hashes.set(12n, HASH("a")); rpc.logs = [companyLog(12n)]; const persister = new FakePersister(); persister.failures = 1; const checkpoints = new FakeCheckpointStore();
    await expect(scanOnce(rpc, persister, checkpoints, config())).rejects.toThrow("temporary database failure"); expect(checkpoints.checkpoint).toBeNull();
  });
  it("rejects a changed checkpoint block as a reorg", async () => {
    const rpc = new FakeRpc(); const checkpoints = new FakeCheckpointStore(); checkpoints.checkpoint = { chainId: CHAIN_ID, contractAddress: CONTRACT, lastProcessedBlock: 20n, lastProcessedBlockHash: HASH("b") };
    await expect(scanOnce(rpc, new FakePersister(), checkpoints, config())).rejects.toBeInstanceOf(ReorgDetectedError);
  });
  it("rejects a boundary that changes while logs are being read", async () => {
    const rpc = new FakeRpc(); const original = rpc.getBlock.bind(rpc); let calls = 0;
    rpc.getBlock = async ({ blockNumber }) => { calls += 1; if (calls === 2) return { number: blockNumber, hash: HASH("c") }; return original({ blockNumber }); };
    await expect(scanOnce(rpc, new FakePersister(), new FakeCheckpointStore(), config())).rejects.toBeInstanceOf(ReorgDetectedError);
  });
  it("retries transient persistence failures and eventually succeeds", async () => {
    const rpc = new FakeRpc(); rpc.hashes.set(12n, HASH("a")); rpc.logs = [companyLog(12n)]; const persister = new FakePersister(); persister.failures = 2; const checkpoints = new FakeCheckpointStore(); const controller = new AbortController(); const sleeps: number[] = [];
    await runIndexer(rpc, persister, checkpoints, config(), { signal: controller.signal, maxRetries: 3, pollIntervalMs: 1, sleep: async (ms) => { sleeps.push(ms); if (ms === 1) controller.abort(); } });
    expect(sleeps.slice(0, 2)).toEqual([500, 1000]); expect(checkpoints.saves).toBe(1); expect(persister.events).toHaveLength(1);
  });
  it("stops cleanly on shutdown", async () => {
    const controller = new AbortController(); await runIndexer(new FakeRpc(), new FakePersister(), new FakeCheckpointStore(), config(), { signal: controller.signal, pollIntervalMs: 1, sleep: async () => controller.abort() });
    expect(controller.signal.aborted).toBe(true);
  });
  it("bounds exponential retry delay", () => { expect(backoffMs(1)).toBe(500); expect(backoffMs(2)).toBe(1000); expect(backoffMs(10)).toBe(30000); });
});
