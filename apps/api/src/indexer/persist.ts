import type { Database } from "../db/database";
import type { PayChadDomainEvent } from "./events";

export type PersistResult = "inserted" | "replayed";
type JsonValue = null | string | number | boolean | readonly JsonValue[] | { readonly [key: string]: JsonValue | undefined };

type HexString = `0x${string}`;

export async function persistPayChadEvent(db: Database, event: PayChadDomainEvent): Promise<PersistResult> {
  return db.begin(async (transaction) => persistPayChadEventInTransaction(transaction as unknown as Database, event));
}
export async function persistPayChadEvents(db: Database, events: readonly PayChadDomainEvent[]): Promise<void> {
  const ordered = [...events].sort(compareEventOrder);
  await db.begin(async (transaction) => {
    const tx = transaction as unknown as Database;
    for (const event of ordered) await persistPayChadEventInTransaction(tx, event);
  });
}

async function persistPayChadEventInTransaction(db: Database, event: PayChadDomainEvent): Promise<PersistResult> {
  if (!event.blockHash) throw new Error("Block hash is required for persistence");
  if (event.transactionIndex == null) throw new Error("Transaction index is required for persistence");

  await db`
    INSERT INTO blockchain_transactions (chain_id, transaction_hash, block_number, block_hash, transaction_index, confirmed_at)
    VALUES (${event.chainId.toString()}, ${event.transactionHash}, ${event.blockNumber.toString()}, ${event.blockHash}, ${event.transactionIndex}, now())
    ON CONFLICT (chain_id, transaction_hash) DO NOTHING
  `;

  const [transaction] = await db<{ block_number: string; block_hash: HexString; transaction_index: string }[]>`
    SELECT block_number::text, block_hash, transaction_index::text AS transaction_index
    FROM blockchain_transactions
    WHERE chain_id = ${event.chainId.toString()} AND transaction_hash = ${event.transactionHash}
  `;
  if (!transaction || transaction.block_number !== event.blockNumber.toString() || transaction.block_hash !== event.blockHash || transaction.transaction_index !== event.transactionIndex.toString()) {
    throw new Error("Conflicting transaction provenance for an existing transaction hash");
  }

  const eventData = serializeEvent(event);
  const inserted = await db<{ chain_id: string; block_number: string; transaction_hash: string; log_index: string }[]>`
    INSERT INTO indexed_events (chain_id, block_number, transaction_hash, log_index, block_hash, contract_address, event_name, event_data)
    VALUES (${event.chainId.toString()}, ${event.blockNumber.toString()}, ${event.transactionHash}, ${event.logIndex.toString()}, ${event.blockHash}, ${event.contractAddress}, ${event.kind}, ${db.json(eventData)})
    ON CONFLICT (chain_id, block_number, transaction_hash, log_index) DO NOTHING
    RETURNING chain_id, block_number, transaction_hash, log_index
  `;
  if (inserted.length === 0) {
    const [matching] = await db<{ ok: boolean }[]>`
      SELECT true AS ok FROM indexed_events
      WHERE chain_id = ${event.chainId.toString()} AND block_number = ${event.blockNumber.toString()} AND transaction_hash = ${event.transactionHash} AND log_index = ${event.logIndex.toString()}
        AND block_hash = ${event.blockHash} AND contract_address = ${event.contractAddress} AND event_name = ${event.kind} AND event_data = ${db.json(eventData)}
    `;
    if (!matching) throw new Error("Conflicting event data for an existing blockchain event identity");
    return "replayed";
  }

  const observedAt = new Date();
  switch (event.kind) {
    case "CompanyRegistered":
      await db`INSERT INTO companies (chain_id, company_id, owner_address, name, created_at) VALUES (${event.chainId.toString()}, ${event.companyId.toString()}, ${event.owner}, ${event.name}, ${observedAt})`;
      break;
    case "EmployeeAdded":
      await db`INSERT INTO employees (chain_id, company_id, employee_id, wallet_address, salary_base_units, active, created_at, updated_at) VALUES (${event.chainId.toString()}, ${event.companyId.toString()}, ${event.employeeId.toString()}, ${event.wallet}, ${event.salary.toString()}, true, ${observedAt}, ${observedAt})`;
      break;
    case "EmployeeStatusChanged": {
      const result = await db`UPDATE employees SET active = ${event.active}, updated_at = ${observedAt} WHERE chain_id = ${event.chainId.toString()} AND company_id = ${event.companyId.toString()} AND employee_id = ${event.employeeId.toString()}`;
      if (result.count !== 1) throw new Error("EmployeeStatusChanged prerequisite employee is missing");
      break;
    }
    case "PayrollFunded":
    case "PayrollWithdrawn":
      break;
    case "PayrollRunCreated":
      await db`INSERT INTO payroll_runs (chain_id, company_id, run_id, created_at) VALUES (${event.chainId.toString()}, ${event.companyId.toString()}, ${event.runId.toString()}, ${observedAt})`;
      break;
    case "PayrollPayment":
      await db`INSERT INTO payroll_payments (chain_id, company_id, run_id, employee_id, recipient_address, amount_base_units, block_number, transaction_hash, log_index, paid_at) VALUES (${event.chainId.toString()}, ${event.companyId.toString()}, ${event.runId.toString()}, ${event.employeeId.toString()}, ${event.recipient}, ${event.amount.toString()}, ${event.blockNumber.toString()}, ${event.transactionHash}, ${event.logIndex.toString()}, ${observedAt})`;
      break;
    case "PayrollRunCompleted": {
      const result = await db`UPDATE payroll_runs SET completed_at = ${observedAt}, total_paid_base_units = COALESCE(total_paid_base_units, 0) + ${event.totalPaid.toString()}, employee_count = COALESCE(employee_count, 0) + ${event.employeeCount.toString()} WHERE chain_id = ${event.chainId.toString()} AND company_id = ${event.companyId.toString()} AND run_id = ${event.runId.toString()}`;
      if (result.count !== 1) throw new Error("PayrollRunCompleted prerequisite payroll run is missing");
      break;
    }
  }
  return "inserted";
}

function compareEventOrder(a: PayChadDomainEvent, b: PayChadDomainEvent): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  const aTx = a.transactionIndex ?? Number.MAX_SAFE_INTEGER;
  const bTx = b.transactionIndex ?? Number.MAX_SAFE_INTEGER;
  if (aTx !== bTx) return aTx - bTx;
  if (a.logIndex !== b.logIndex) return a.logIndex < b.logIndex ? -1 : 1;
  return 0;
}

function serializeEvent(event: PayChadDomainEvent): JsonValue {
  const { chainId, blockNumber, blockHash, transactionHash, transactionIndex, logIndex, contractAddress, kind, ...args } = event;
  return { chainId: chainId.toString(), blockNumber: blockNumber.toString(), blockHash, transactionHash, transactionIndex, logIndex: logIndex.toString(), contractAddress, eventName: kind, args: stringifyBigInts(args) };
}
function stringifyBigInts(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(stringifyBigInts);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringifyBigInts(item)]));
  throw new Error("Unsupported event payload value");
}
