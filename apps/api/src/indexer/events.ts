import { parseEventLogs, parseAbi, type Address, type Hex } from "viem";

export const payChadPayrollEvents = parseAbi([
  "event CompanyRegistered(uint256 indexed companyId, address indexed owner, string name)",
  "event EmployeeAdded(uint256 indexed companyId, uint256 indexed employeeId, address indexed wallet, uint256 salary)",
  "event EmployeeStatusChanged(uint256 indexed companyId, uint256 indexed employeeId, bool active)",
  "event PayrollFunded(uint256 indexed companyId, address indexed funder, uint256 amount)",
  "event PayrollRunCreated(uint256 indexed companyId, uint256 indexed runId)",
  "event PayrollPayment(uint256 indexed companyId, uint256 indexed runId, uint256 indexed employeeId, address recipient, uint256 amount)",
  "event PayrollRunCompleted(uint256 indexed companyId, uint256 indexed runId, uint256 totalPaid, uint256 employeeCount)",
  "event PayrollWithdrawn(uint256 indexed companyId, address indexed recipient, uint256 amount)",
]);

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
  if (!/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash)) throw new Error("Invalid transaction hash");
  if (!/^0x[0-9a-fA-F]{40}$/.test(log.address)) throw new Error("Invalid contract address");

  const [decoded] = parseEventLogs({
    abi: payChadPayrollEvents,
    logs: [{ data: log.data, topics: log.topics as unknown as [Hex, ...Hex[]] }],
    strict: true,
  });
  if (!decoded) throw new Error("Unsupported or malformed PayChadPayroll event log");

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
    case "CompanyRegistered": return { ...base, kind: "CompanyRegistered", companyId: asBigInt(args.companyId, "companyId"), owner: asAddress(args.owner, "owner"), name: asString(args.name, "name") };
    case "EmployeeAdded": return { ...base, kind: "EmployeeAdded", companyId: asBigInt(args.companyId, "companyId"), employeeId: asPositiveBigInt(args.employeeId, "employeeId"), wallet: asAddress(args.wallet, "wallet"), salary: asPositiveBigInt(args.salary, "salary") };
    case "EmployeeStatusChanged": return { ...base, kind: "EmployeeStatusChanged", companyId: asBigInt(args.companyId, "companyId"), employeeId: asPositiveBigInt(args.employeeId, "employeeId"), active: asBoolean(args.active, "active") };
    case "PayrollFunded": return { ...base, kind: "PayrollFunded", companyId: asBigInt(args.companyId, "companyId"), funder: asAddress(args.funder, "funder"), amount: asPositiveBigInt(args.amount, "amount") };
    case "PayrollRunCreated": return { ...base, kind: "PayrollRunCreated", companyId: asBigInt(args.companyId, "companyId"), runId: asPositiveBigInt(args.runId, "runId") };
    case "PayrollPayment": return { ...base, kind: "PayrollPayment", companyId: asBigInt(args.companyId, "companyId"), runId: asPositiveBigInt(args.runId, "runId"), employeeId: asPositiveBigInt(args.employeeId, "employeeId"), recipient: asAddress(args.recipient, "recipient"), amount: asPositiveBigInt(args.amount, "amount") };
    case "PayrollRunCompleted": return { ...base, kind: "PayrollRunCompleted", companyId: asBigInt(args.companyId, "companyId"), runId: asPositiveBigInt(args.runId, "runId"), totalPaid: asPositiveBigInt(args.totalPaid, "totalPaid"), employeeCount: asPositiveBigInt(args.employeeCount, "employeeCount") };
    case "PayrollWithdrawn": return { ...base, kind: "PayrollWithdrawn", companyId: asBigInt(args.companyId, "companyId"), recipient: asAddress(args.recipient, "recipient"), amount: asPositiveBigInt(args.amount, "amount") };
    default: throw new Error(`Unsupported PayChadPayroll event: ${String(decoded.eventName)}`);
  }
}

function asBigInt(value: unknown, field: string): bigint { if (typeof value !== "bigint") throw new Error(`Invalid decoded ${field}`); return value; }
function asPositiveBigInt(value: unknown, field: string): bigint { const result = asBigInt(value, field); if (result <= 0n) throw new Error(`Invalid decoded ${field}`); return result; }
function asAddress(value: unknown, field: string): Address { if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid decoded ${field}`); return value as Address; }
function asString(value: unknown, field: string): string { if (typeof value !== "string") throw new Error(`Invalid decoded ${field}`); return value; }
function asBoolean(value: unknown, field: string): boolean { if (typeof value !== "boolean") throw new Error(`Invalid decoded ${field}`); return value; }

export type { RawBlockchainLog };
