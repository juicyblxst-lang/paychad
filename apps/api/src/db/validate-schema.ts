import postgres from "postgres";
import { getDatabaseUrl } from "./database";

const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const OWNER = "0x1111111111111111111111111111111111111111";
const EMPLOYEE = "0x2222222222222222222222222222222222222222";
const CONTRACT = "0x3333333333333333333333333333333333333333";
const TX = "0x" + "44".repeat(32);
const BLOCK = "0x" + "55".repeat(32);
const REQUEST_HASH = "aa".repeat(32);

async function expectConstraintFailure(operation: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`Expected constraint failure: ${label}`);
}

export async function validateSchema(): Promise<void> {
  const sql = postgres(getDatabaseUrl(), { max: 1, prepare: true });

  try {
    await sql.begin(async (tx) => {
      const [migration] = await tx<{ migration_id: string }[]>`
        SELECT migration_id
        FROM schema_migrations
        WHERE migration_id = '0001_initial'
      `;
      if (!migration) throw new Error("0001_initial migration is not recorded");

      await tx`
        INSERT INTO companies (chain_id, company_id, owner_address, name, created_at)
        VALUES (143, 1, ${OWNER}, 'Schema Test', now())
      `;
      await expectConstraintFailure(
        () => tx`
          INSERT INTO companies (chain_id, company_id, owner_address, name, created_at)
          VALUES (143, 2, ${OWNER}, 'Duplicate Owner', now())
        `,
        "company owner uniqueness",
      );

      await tx`
        INSERT INTO employees (
          chain_id, company_id, employee_id, wallet_address, salary_base_units, active, created_at, updated_at
        ) VALUES (143, 1, 1, ${EMPLOYEE}, ${MAX_UINT256}, true, now(), now())
      `;
      await expectConstraintFailure(
        () => tx`
          INSERT INTO employees (
            chain_id, company_id, employee_id, wallet_address, salary_base_units, active, created_at, updated_at
          ) VALUES (143, 1, 1, ${EMPLOYEE}, 1, true, now(), now())
        `,
        "employee primary key uniqueness",
      );

      await tx`
        INSERT INTO blockchain_transactions (
          chain_id, transaction_hash, block_number, block_hash, transaction_index, confirmed_at
        ) VALUES (143, ${TX}, 100, ${BLOCK}, 0, now())
      `;

      await tx`
        INSERT INTO indexed_events (
          chain_id, block_number, transaction_hash, log_index, block_hash, contract_address, event_name
        ) VALUES (143, 100, ${TX}, 0, ${BLOCK}, ${CONTRACT}, 'PayrollPayment')
      `;
      await expectConstraintFailure(
        () => tx`
          INSERT INTO indexed_events (
            chain_id, block_number, transaction_hash, log_index, block_hash, contract_address, event_name
          ) VALUES (143, 100, ${TX}, 0, ${BLOCK}, ${CONTRACT}, 'PayrollPayment')
        `,
        "blockchain event identity uniqueness",
      );

      await tx`
        INSERT INTO payroll_runs (chain_id, company_id, run_id, created_at)
        VALUES (143, 1, 1, now())
      `;
      await tx`
        INSERT INTO payroll_payments (
          chain_id, company_id, run_id, employee_id, recipient_address, amount_base_units,
          block_number, transaction_hash, log_index, paid_at
        ) VALUES (143, 1, 1, 1, ${EMPLOYEE}, ${MAX_UINT256}, 100, ${TX}, 0, now())
      `;
      await expectConstraintFailure(
        () => tx`
          INSERT INTO payroll_payments (
            chain_id, company_id, run_id, employee_id, recipient_address, amount_base_units,
            block_number, transaction_hash, log_index, paid_at
          ) VALUES (143, 1, 1, 1, ${EMPLOYEE}, 1, 100, ${TX}, 0, now())
        `,
        "payroll payment uniqueness",
      );

      await tx`
        INSERT INTO idempotency_keys (idempotency_key, operation, request_hash, status)
        VALUES ('schema-test-key', 'schema-test', ${REQUEST_HASH}, 'pending')
      `;
      await expectConstraintFailure(
        () => tx`
          INSERT INTO idempotency_keys (idempotency_key, operation, request_hash, status)
          VALUES ('schema-test-key', 'schema-test', ${REQUEST_HASH}, 'pending')
        `,
        "idempotency key uniqueness",
      );

      await expectConstraintFailure(
        () => tx`
          INSERT INTO payroll_runs (chain_id, company_id, run_id, created_at)
          VALUES (143, 999, 2, now())
        `,
        "company foreign key",
      );

      const [salary] = await tx<{ salary_base_units: string }[]>`
        SELECT salary_base_units::text
        FROM employees
        WHERE chain_id = 143 AND company_id = 1 AND employee_id = 1
      `;
      if (!salary || salary.salary_base_units !== MAX_UINT256) {
        throw new Error("Exact uint256-sized monetary value was not preserved");
      }

      await tx`DELETE FROM idempotency_keys WHERE idempotency_key = 'schema-test-key'`;
      await tx`DELETE FROM payroll_payments WHERE chain_id = 143 AND company_id = 1 AND run_id = 1 AND employee_id = 1`;
      await tx`DELETE FROM payroll_runs WHERE chain_id = 143 AND company_id = 1 AND run_id = 1`;
      await tx`DELETE FROM indexed_events WHERE chain_id = 143 AND block_number = 100 AND transaction_hash = ${TX} AND log_index = 0`;
      await tx`DELETE FROM blockchain_transactions WHERE chain_id = 143 AND transaction_hash = ${TX}`;
      await tx`DELETE FROM employees WHERE chain_id = 143 AND company_id = 1 AND employee_id = 1`;
      await tx`DELETE FROM companies WHERE chain_id = 143 AND company_id = 1`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateSchema().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
