import postgres from "postgres";
import { getDatabaseUrl, type Database } from "./database";

type RootDatabase = ReturnType<typeof postgres>;

const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const OWNER = "0x1111111111111111111111111111111111111111";
const EMPLOYEE = "0x2222222222222222222222222222222222222222";
const CONTRACT = "0x3333333333333333333333333333333333333333";
const TX = "0x" + "44".repeat(32);
const BLOCK = "0x" + "55".repeat(32);
const REQUEST_HASH = "aa".repeat(32);
const EXPECTED_FAILURE = "expected-constraint-failure";

async function expectConstraintFailure(
  sql: RootDatabase,
  operation: (db: Database) => Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      const db = tx as unknown as Database;
      await operation(db);
      throw new Error(EXPECTED_FAILURE);
    });
  } catch (error) {
    if (error instanceof Error && error.message === EXPECTED_FAILURE) {
      throw new Error(`Expected constraint failure: ${label}`);
    }
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
    if (!code.startsWith("23")) {
      throw error;
    }
  }
}

export async function validateSchema(): Promise<void> {
  const sql = postgres(getDatabaseUrl(), { max: 1, prepare: true });

  try {
    await sql.begin(async (tx) => {
      const db = tx as unknown as Database;
      const [migration] = await db<{ migration_id: string }[]>`
        SELECT migration_id
        FROM schema_migrations
        WHERE migration_id = '0001_initial'
      `;
      if (!migration) throw new Error("0001_initial migration is not recorded");

      await db`
        INSERT INTO companies (chain_id, company_id, owner_address, name, created_at)
        VALUES (143, 1, ${OWNER}, 'Schema Test', now())
      `;
      await db`
        INSERT INTO employees (
          chain_id, company_id, employee_id, wallet_address, salary_base_units, active, created_at, updated_at
        ) VALUES (143, 1, 1, ${EMPLOYEE}, ${MAX_UINT256}, true, now(), now())
      `;
      await db`
        INSERT INTO blockchain_transactions (
          chain_id, transaction_hash, block_number, block_hash, transaction_index, confirmed_at
        ) VALUES (143, ${TX}, 100, ${BLOCK}, 0, now())
      `;
      await db`
        INSERT INTO indexed_events (
          chain_id, block_number, transaction_hash, log_index, block_hash, contract_address, event_name
        ) VALUES (143, 100, ${TX}, 0, ${BLOCK}, ${CONTRACT}, 'PayrollPayment')
      `;
      await db`
        INSERT INTO payroll_runs (chain_id, company_id, run_id, created_at)
        VALUES (143, 1, 1, now())
      `;
      await db`
        INSERT INTO payroll_payments (
          chain_id, company_id, run_id, employee_id, recipient_address, amount_base_units,
          block_number, transaction_hash, log_index, paid_at
        ) VALUES (143, 1, 1, 1, ${EMPLOYEE}, ${MAX_UINT256}, 100, ${TX}, 0, now())
      `;
      await db`
        INSERT INTO idempotency_keys (idempotency_key, operation, request_hash, status)
        VALUES ('schema-test-key', 'schema-test', ${REQUEST_HASH}, 'pending')
      `;
    });

    await expectConstraintFailure(
      sql,
      (db) => db`
        INSERT INTO companies (chain_id, company_id, owner_address, name, created_at)
        VALUES (143, 2, ${OWNER}, 'Duplicate Owner', now())
      `,
      "company owner uniqueness",
    );

    await expectConstraintFailure(
      sql,
      (db) => db`
        INSERT INTO employees (
          chain_id, company_id, employee_id, wallet_address, salary_base_units, active, created_at, updated_at
        ) VALUES (143, 1, 1, ${EMPLOYEE}, 1, true, now(), now())
      `,
      "employee primary key uniqueness",
    );

    await expectConstraintFailure(
      sql,
      (db) => db`
        INSERT INTO indexed_events (
          chain_id, block_number, transaction_hash, log_index, block_hash, contract_address, event_name
        ) VALUES (143, 100, ${TX}, 0, ${BLOCK}, ${CONTRACT}, 'PayrollPayment')
      `,
      "blockchain event identity uniqueness",
    );

    await expectConstraintFailure(
      sql,
      (db) => db`
        INSERT INTO payroll_payments (
          chain_id, company_id, run_id, employee_id, recipient_address, amount_base_units,
          block_number, transaction_hash, log_index, paid_at
        ) VALUES (143, 1, 1, 1, ${EMPLOYEE}, 1, 100, ${TX}, 0, now())
      `,
      "payroll payment uniqueness",
    );

    await expectConstraintFailure(
      sql,
      (db) => db`
        INSERT INTO idempotency_keys (idempotency_key, operation, request_hash, status)
        VALUES ('schema-test-key', 'schema-test', ${REQUEST_HASH}, 'pending')
      `,
      "idempotency key uniqueness",
    );

    await expectConstraintFailure(
      sql,
      (db) => db`
        INSERT INTO payroll_runs (chain_id, company_id, run_id, created_at)
        VALUES (143, 999, 2, now())
      `,
      "company foreign key",
    );

    const [salary] = await sql<{ salary_base_units: string }[]>`
      SELECT salary_base_units::text
      FROM employees
      WHERE chain_id = 143 AND company_id = 1 AND employee_id = 1
    `;
    if (!salary || salary.salary_base_units !== MAX_UINT256) {
      throw new Error("Exact uint256-sized monetary value was not preserved");
    }

    await sql.begin(async (tx) => {
      const db = tx as unknown as Database;
      await db`DELETE FROM idempotency_keys WHERE idempotency_key = 'schema-test-key'`;
      await db`DELETE FROM payroll_payments WHERE chain_id = 143 AND company_id = 1 AND run_id = 1 AND employee_id = 1`;
      await db`DELETE FROM payroll_runs WHERE chain_id = 143 AND company_id = 1 AND run_id = 1`;
      await db`DELETE FROM indexed_events WHERE chain_id = 143 AND block_number = 100 AND transaction_hash = ${TX} AND log_index = 0`;
      await db`DELETE FROM blockchain_transactions WHERE chain_id = 143 AND transaction_hash = ${TX}`;
      await db`DELETE FROM employees WHERE chain_id = 143 AND company_id = 1 AND employee_id = 1`;
      await db`DELETE FROM companies WHERE chain_id = 143 AND company_id = 1`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("/validate-schema.ts") || process.argv[1]?.endsWith("/validate-schema.js")) {
  validateSchema().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
