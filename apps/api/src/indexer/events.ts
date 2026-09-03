import { decodeEventLog, type Address, type Hex } from "viem";

export const payChadPayrollEvents = [
  { type: "event", name: "CompanyRegistered", inputs: [{ indexed: true, name: "companyId", type: "uint256" }, { indexed: true, name: "owner", type: "address" }, { indexed: false, name: "name", type: "string" }] },
  { type: "event", name: "EmployeeAdded", inputs: [{ indexed: true, name: "companyId", type: "uint256" }, { indexed: true, name: "employeeId", type: "uint256" }, { indexed: true, name: "wallet", type: "address" }, { indexed: false, name: "salary", type: "uint256" }] },
  { type: "event", name: "EmployeeStatusChanged", inputs: [{ indexed: true, name: "companyId", type: "uint256" }, { indexed: true, name: "employeeId", type: "uint256" }, { indexed: false, name: "active", type: "bool" }] },
  { type: "event", name: "PayrollFunded", inputs: [{ indexed: true, name: "companyId", type: "uint256" }, { indexed: true, name: "funder", type: "address" }, { indexed: false, name: "amount", type: "uint256" }] },
  { type: "event", name: "PayrollRunCreated", inputs: [{ indexed: true, name: "companyId", type: "uint256" }, { indexed: true, name: "runId", type: "uint256" }] },
  { type: "event", name: "PayrollPayment", inputs: [{ indexed: true, name: "companyId", type: "uint256" }, { indexed: true, name: "runId", type: "uint256" }, { indexed: true, name: "employeeId", type: "uint256" }, { indexed: false, name: "recipient", type: "address" }, { indexed: false, name: "amount", type: "uint256" }] },
  { type: "event", name: "PayrollRunCompleted", inputs: [{ indexed: true, name: "companyId", type: "uint256" }, { indexed: true, name: "runId", type: "uint256" }, { indexed: false, name: "totalPaid", type: "uint256" }, { indexed: false, name: "employeeCount", type: "uint256" }] },
  { type: "event", name: "PayrollWithdrawn", inputs: [{ indexed: true, name: "companyId", type: "uint256" }, { indexed: true, name: "recipient", type: "address" }, { indexed: false, name: "amount", type: "uint256" }] },
] as const;

type RawBlockchainLog = {
  chainId: bigint;
  blockNumber: bigint;
  blockHash?: Hex | null;
  transactionHash: Hex;
  transactionIndex?: number | null;
  logIndex: number | bigint;
  address: Address;
  topics: readonly Hex[];
  data: Hex;
};

type BaseDomainEvent = {
  chainId: bigint;
  blockNumber: bigint;
  blockHash: Hex | null;
  transactionHash: Hex;
  transactionIndex: number | null;
  logIndex: bigint;
  contractAddress: Address;
};

export type PayChadDomainEvent = BaseDomainEvent & (
  | { kind: "CompanyRegistered"; companyId: bigint; owner: Address; name: string }
  | { kind: "EmployeeAdded"; companyId: bigint; employeeId: bigint; wallet: Address; salary: bigint }
  | { kind: "EmployeeStatusChanged"; companyId: bigint; employeeId: bigint; active: boolean }
  | { kind: "PayrollFunded"; companyId: bigint; funder: Address; amount: bigint }
  | { kind: "PayrollRunCreated"; companyId: bigint; runId: bigint }
  | { kind: "PayrollPayment"; companyId: bigint; runId: bigint; employeeId: bigint; recipient: Address; amount: bigint }
  | { kind: "PayrollRunCompleted"; companyId: bigint; runId: bigint; totalPaid: bigint; employeeCount: bigint }
  | { kind: "PayrollWithdrawn"; companyId: bigint; recipient: Address; amount: bigint }
);

export function decodePayChadEvent(log: RawBlockchainLog): PayChadDomainEvent {
  if (log.chainId <= 0n) throw new Error("Invalid chain ID");
  if (log.blockNumber < 0n) throw new Error("Invalid block number");
  if (BigInt(log.logIndex) < 0n) throw new Error("Invalid log index");
  if (!log.transactionHash || !log.address) throw new Error("Incomplete blockchain log identity");

  const decoded = decodeEventLog({ abi: payChadPayrollEvents, data: log.data, topics: log.topics });
  const args = decoded.args as Record<string, unknown>;
  const base: BaseDomainEvent = {
    chainId: log.chainId,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash ?? null,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex ?? null,
    logIndex: BigInt(log.logIndex),
    contractAddress: log.address,
  };

  switch (decoded.eventName) {
    case "CompanyRegistered": return { ...base, kind: decoded.eventName, companyId: asBigInt(args.companyId, "companyId"), owner: asAddress(args.owner, "owner"), name: asString(args.name, "name") };
    case "EmployeeAdded": return { ...base, kind: decoded.eventName, companyId: asBigInt(args.companyId, "companyId"), employeeId: asPositiveBigInt(args.employeeId, "employeeId"), wallet: asAddress(args.wallet, "wallet"), salary: asPositiveBigInt(args.salary, "salary") };
    case "EmployeeStatusChanged": return { ...base, kind: decoded.eventName, companyId: asBigInt(args.companyId, "companyId"), employeeId: asPositiveBigInt(args.employeeId, "employeeId"), active: asBoolean(args.active, "active") };
    case "PayrollFunded": return { ...base, kind: decoded.eventName, companyId: asBigInt(args.companyId, "companyId"), funder: asAddress(args.funder, "funder"), amount: asPositiveBigInt(args.amount, "amount") };
    case "PayrollRunCreated": return { ...base, kind: decoded.eventName, companyId: asBigInt(args.companyId, "companyId"), runId: asPositiveBigInt(args.runId, "runId") };
    case "PayrollPayment": return { ...base, kind: decoded.eventName, companyId: asBigInt(args.companyId, "companyId"), runId: asPositiveBigInt(args.runId, "runId"), employeeId: asPositiveBigInt(args.employeeId, "employeeId"), recipient: asAddress(args.recipient, "recipient"), amount: asPositiveBigInt(args.amount, "amount") };
    case "PayrollRunCompleted": return { ...base, kind: decoded.eventName, companyId: asBigInt(args.companyId, "companyId"), runId: asPositiveBigInt(args.runId, "runId"), totalPaid: asPositiveBigInt(args.totalPaid, "totalPaid"), employeeCount: asPositiveBigInt(args.employeeCount, "employeeCount") };
    case "PayrollWithdrawn": return { ...base, kind: decoded.eventName, companyId: asBigInt(args.companyId, "companyId"), recipient: asAddress(args.recipient, "recipient"), amount: asPositiveBigInt(args.amount, "amount") };
    default: throw new Error(`Unsupported PayChadPayroll event: ${String(decoded.eventName)}`);
  }
}

function asBigInt(value: unknown, field: string): bigint { if (typeof value !== "bigint") throw new Error(`Invalid decoded ${field}`); return value; }
function asPositiveBigInt(value: unknown, field: string): bigint { const result = asBigInt(value, field); if (result <= 0n) throw new Error(`Invalid decoded ${field}`); return result; }
function asAddress(value: unknown, field: string): Address { if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid decoded ${field}`); return value as Address; }
function asString(value: unknown, field: string): string { if (typeof value !== "string") throw new Error(`Invalid decoded ${field}`); return value; }
function asBoolean(value: unknown, field: string): boolean { if (typeof value !== "boolean") throw new Error(`Invalid decoded ${field}`); return value; }

export type { RawBlockchainLog };
