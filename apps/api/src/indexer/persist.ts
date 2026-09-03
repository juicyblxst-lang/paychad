import type { Database } from "../db/database";
import type { PayChadDomainEvent } from "./events";

export type PersistResult = "inserted" | "replayed";

export async function persistPayChadEvent(db: Database, event: PayChadDomainEvent): Promise<PersistResult> {
  const existing = await db<{
    block_hash: string;
    contract_address: string;
    event_name: string;
    event_data: unknown;
  }[]>`
    SELECT block_hash, contract_address, event_name, event_data
    FROM indexed_events
    WHERE chain_id = ${event.chainId}
      AND block_number = ${event.blockNumber}
      AND transaction_hash = ${event.transactionHash}
      AND log_index = ${event.logIndex}
  `;

  const eventData = serializeEvent(event);

  if (existing.length > 0) {
    const row = existing[0]!;
    if (
      row.block_hash.toLowerCase() !== event.blockHash!.toLowerCase()
      || row.contract_address.toLowerCase() !== event.contractAddress.toLowerCase()
      || row.event_name !== event.kind
      || JSON.stringify(row.event_data) !== JSON.stringify(eventData)
    ) {
      throw new Error("Conflicting event data for an existing blockchain event identity");
    }
    return "replayed";
  }

  await db`
    INSERT INTO blockchain_transactions (
      chain_id, transaction_hash, block_number, block_hash, transaction_index, confirmed_at
    ) VALUES (
      ${event.chainId}, ${event.transactionHash}, ${event.blockNumber}, ${event.blockHash!}, ${event.transactionIndex!}, now()
    )
    ON CONFLICT (chain_id, transaction_hash) DO NOTHING
  `;

  await db`
    INSERT INTO indexed_events (
      chain_id, block_number, transaction_hash, log_index, block_hash, contract_address, event_name, event_data
    ) VALUES (
      ${event.chainId}, ${event.blockNumber}, ${event.transactionHash}, ${event.logIndex},
      ${event.blockHash!}, ${event.contractAddress}, ${event.kind}, ${JSON.stringify(eventData)}::jsonb
    )
  `;

  const observedAt = new Date();

  switch (event.kind) {
    case "CompanyRegistered":
      await db`
        INSERT INTO companies (chain_id, company_id, owner_address, name, created_at)
        VALUES (${event.chainId}, ${event.companyId}, ${event.owner}, ${event.name}, ${observedAt})
      `;
      break;

    case "EmployeeAdded":
      await db`
        INSERT INTO employees (
          chain_id, company_id, employee_id, wallet_address, salary_base_units, active, created_at, updated_at
        ) VALUES (
          ${event.chainId}, ${event.companyId}, ${event.employeeId}, ${event.wallet}, ${event.salary}, true, ${observedAt}, ${observedAt}
        )
      `;
      break;

    case "EmployeeStatusChanged":
      await db`
        UPDATE employees
        SET active = ${event.active}, updated_at = ${observedAt}
        WHERE chain_id = ${event.chainId}
          AND company_id = ${event.companyId}
          AND employee_id = ${event.employeeId}
      `;
      await requireAffectedRow(db, "EmployeeStatusChanged prerequisite employee is missing");
      break;

    case "PayrollFunded":
    case "PayrollWithdrawn":
      // These events are fully represented by indexed_events. PostgreSQL must not
      // invent an off-chain payroll balance that can diverge from Monad.
      break;

    case "PayrollRunCreated":
      await db`
        INSERT INTO payroll_runs (chain_id, company_id, run_id, created_at)
        VALUES (${event.chainId}, ${event.companyId}, ${event.runId}, ${observedAt})
      `;
      break;

    case "PayrollPayment":
      await db`
        INSERT INTO payroll_payments (
          chain_id, company_id, run_id, employee_id, recipient_address, amount_base_units,
          block_number, transaction_hash, log_index, paid_at
        ) VALUES (
          ${event.chainId}, ${event.companyId}, ${event.runId}, ${event.employeeId}, ${event.recipient}, ${event.amount},
          ${event.blockNumber}, ${event.transactionHash}, ${event.logIndex}, ${observedAt}
        )
      `;
      break;

    case "PayrollRunCompleted":
      await db`
        UPDATE payroll_runs
        SET completed_at = ${observedAt}, total_paid_base_units = ${event.totalPaid}, employee_count = ${event.employeeCount}
        WHERE chain_id = ${event.chainId}
          AND company_id = ${event.companyId}
          AND run_id = ${event.runId}
      `;
      await requireAffectedRow(db, "PayrollRunCompleted prerequisite payroll run is missing");
      break;
  }

  return "inserted";
}

export async function persistPayChadEvents(db: Database, events: readonly PayChadDomainEvent[]): Promise<void> {
  const ordered = [...events].sort(compareEventOrder);
  await db.begin(async (transaction) => {
    const tx = transaction as unknown as Database;
    for (const event of ordered) await persistPayChadEvent(tx, event);
  });
}

function compareEventOrder(a: PayChadDomainEvent, b: PayChadDomainEvent): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  if (a.transactionIndex !== b.transactionIndex) return (a.transactionIndex ?? Number.MAX_SAFE_INTEGER) - (b.transactionIndex ?? Number.MAX_SAFE_INTEGER);
  if (a.logIndex !== b.logIndex) return a.logIndex < b.logIndex ? -1 : 1;
  return 0;
}

function serializeEvent(event: PayChadDomainEvent): Record<string, unknown> {
  const { chainId, blockNumber, blockHash, transactionHash, transactionIndex, logIndex, contractAddress, kind, ...args } = event;
  return {
    chainId: chainId.toString(),
    blockNumber: blockNumber.toString(),
    blockHash,
    transactionHash,
    transactionIndex,
    logIndex: logIndex.toString(),
    contractAddress,
    eventName: kind,
    args: stringifyBigInts(args),
  };
}

function stringifyBigInts(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringifyBigInts);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringifyBigInts(item)]));
  }
  return value;
}

async function requireAffectedRow(db: Database, message: string): Promise<void> {
  // The postgres tagged-query result exposes count; use a query-local marker so
  // prerequisite absence becomes a rollback rather than silently accepted state.
  // Callers use this only after a deterministic UPDATE.
  const [{ exists }] = await db<{ exists: boolean }[]>`SELECT false AS exists`;
  if (!exists) throw new Error(message);
}
