import type { Database } from "../db/database";
import type { PayChadDomainEvent } from "./events";

export type PersistResult = "inserted" | "replayed";

export async function persistPayChadEvent(db: Database, event: PayChadDomainEvent): Promise<PersistResult> {
  if (!event.blockHash) throw new Error("Block hash is required for persistence");
  if (event.transactionIndex == null) throw new Error("Transaction index is required for persistence");

  await db`
    INSERT INTO blockchain_transactions (
      chain_id, transaction_hash, block_number, block_hash, transaction_index, confirmed_at
    ) VALUES (
      ${event.chainId}, ${event.transactionHash}, ${event.blockNumber}, ${event.blockHash}, ${event.transactionIndex}, now()
    )
    ON CONFLICT (chain_id, transaction_hash) DO NOTHING
  `;

  const eventData = serializeEvent(event);
  const inserted = await db<{
    chain_id: string;
    block_number: string;
    transaction_hash: string;
    log_index: string;
  }[]>`
    INSERT INTO indexed_events (
      chain_id, block_number, transaction_hash, log_index, block_hash, contract_address, event_name, event_data
    ) VALUES (
      ${event.chainId}, ${event.blockNumber}, ${event.transactionHash}, ${event.logIndex},
      ${event.blockHash}, ${event.contractAddress}, ${event.kind}, ${JSON.stringify(eventData)}::jsonb
    )
    ON CONFLICT (chain_id, block_number, transaction_hash, log_index) DO NOTHING
    RETURNING chain_id, block_number, transaction_hash, log_index
  `;

  if (inserted.length === 0) {
    const [existing] = await db<{
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
    if (!existing) throw new Error("Event conflict disappeared before replay verification");
    if (
      existing.block_hash.toLowerCase() !== event.blockHash.toLowerCase()
      || existing.contract_address.toLowerCase() !== event.contractAddress.toLowerCase()
      || existing.event_name !== event.kind
      || JSON.stringify(existing.event_data) !== JSON.stringify(eventData)
    ) {
      throw new Error("Conflicting event data for an existing blockchain event identity");
    }
    return "replayed";
  }

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

    case "EmployeeStatusChanged": {
      const result = await db`
        UPDATE employees
        SET active = ${event.active}, updated_at = ${observedAt}
        WHERE chain_id = ${event.chainId}
          AND company_id = ${event.companyId}
          AND employee_id = ${event.employeeId}
      `;
      if (result.count !== 1) throw new Error("EmployeeStatusChanged prerequisite employee is missing");
      break;
    }

    case "PayrollFunded":
    case "PayrollWithdrawn":
      // These events remain durably represented by indexed_events. No off-chain
      // payroll balance is maintained because Monad is the financial authority.
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

    case "PayrollRunCompleted": {
      const result = await db`
        UPDATE payroll_runs
        SET completed_at = ${observedAt}, total_paid_base_units = ${event.totalPaid}, employee_count = ${event.employeeCount}
        WHERE chain_id = ${event.chainId}
          AND company_id = ${event.companyId}
          AND run_id = ${event.runId}
      `;
      if (result.count !== 1) throw new Error("PayrollRunCompleted prerequisite payroll run is missing");
      break;
    }
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
  const aTx = a.transactionIndex ?? Number.MAX_SAFE_INTEGER;
  const bTx = b.transactionIndex ?? Number.MAX_SAFE_INTEGER;
  if (aTx !== bTx) return aTx - bTx;
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
