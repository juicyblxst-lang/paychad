import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "./db/database";
import { buildServer } from "./server";

const CHAIN_ID = "424242";
const COMPANY_ID = "987654321";
const OWNER = "0x1111111111111111111111111111111111111111";
const EMPLOYEE = "0x2222222222222222222222222222222222222222";
const CONTRACT = "0x3333333333333333333333333333333333333333";
const TX = `0x${"ab".repeat(32)}`;
const BLOCK_HASH = `0x${"cd".repeat(32)}`;
const db = process.env.DATABASE_URL ? createDatabase() : undefined;
const app = buildServer(db);

describe.skipIf(!db)("indexed API routes", () => {
  beforeAll(async () => {
    await db!`DELETE FROM companies WHERE chain_id = ${CHAIN_ID} AND company_id = ${COMPANY_ID}`;
    await db!`
      INSERT INTO companies (chain_id, company_id, owner_address, name, created_at)
      VALUES (${CHAIN_ID}, ${COMPANY_ID}, ${OWNER}, 'Route Test Co', now())
    `;
    await db!`
      INSERT INTO employees (chain_id, company_id, employee_id, wallet_address, salary_base_units, active, created_at, updated_at)
      VALUES (${CHAIN_ID}, ${COMPANY_ID}, '1', ${EMPLOYEE}, '125000000', true, now(), now())
    `;
    await db!`
      INSERT INTO blockchain_transactions (chain_id, transaction_hash, block_number, block_hash, transaction_index, confirmed_at)
      VALUES (${CHAIN_ID}, ${TX}, 500, ${BLOCK_HASH}, 0, now())
    `;
    await db!`
      INSERT INTO indexed_events (chain_id, block_number, transaction_hash, log_index, block_hash, contract_address, event_name, event_data)
      VALUES (${CHAIN_ID}, 500, ${TX}, 0, ${BLOCK_HASH}, ${CONTRACT}, 'CompanyRegistered', ${db!.json({ args: { companyId: COMPANY_ID } })})
    `;
    await db!`
      INSERT INTO payroll_runs (chain_id, company_id, run_id, created_at)
      VALUES (${CHAIN_ID}, ${COMPANY_ID}, '1', now())
    `;
    await db!`
      INSERT INTO payroll_payments (chain_id, company_id, run_id, employee_id, recipient_address, amount_base_units, block_number, transaction_hash, log_index, paid_at)
      VALUES (${CHAIN_ID}, ${COMPANY_ID}, '1', '1', ${EMPLOYEE}, '125000000', 500, ${TX}, 0, now())
    `;
  });

  afterAll(async () => {
    await db!`DELETE FROM companies WHERE chain_id = ${CHAIN_ID} AND company_id = ${COMPANY_ID}`;
    await app.close();
    await db!.end({ timeout: 5 });
  });

  it("returns the owner's company", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/companies?chainId=${CHAIN_ID}&owner=${OWNER}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({ company_id: COMPANY_ID, name: "Route Test Co" });
  });

  it("returns employees, runs, and payments only to the owner", async () => {
    const headers = { "x-wallet-address": OWNER };
    const employees = await app.inject({ method: "GET", url: `/v1/companies/${COMPANY_ID}/employees?chainId=${CHAIN_ID}`, headers });
    const runs = await app.inject({ method: "GET", url: `/v1/companies/${COMPANY_ID}/payroll-runs?chainId=${CHAIN_ID}`, headers });
    const payments = await app.inject({ method: "GET", url: `/v1/companies/${COMPANY_ID}/payments?chainId=${CHAIN_ID}`, headers });
    expect(employees.statusCode).toBe(200);
    expect(runs.statusCode).toBe(200);
    expect(payments.statusCode).toBe(200);
    expect(employees.json()[0].salary_base_units).toBe("125000000");
    expect(runs.json()[0].run_id).toBe("1");
    expect(payments.json()[0].amount_base_units).toBe("125000000");
  });

  it("rejects a different wallet from company data", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/companies/${COMPANY_ID}/employees?chainId=${CHAIN_ID}`, headers: { "x-wallet-address": EMPLOYEE } });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("AUTH_ERROR");
  });

  it("returns indexed transactions and events", async () => {
    const headers = { "x-wallet-address": OWNER };
    const transactions = await app.inject({ method: "GET", url: `/v1/companies/${COMPANY_ID}/transactions?chainId=${CHAIN_ID}`, headers });
    const events = await app.inject({ method: "GET", url: `/v1/companies/${COMPANY_ID}/events?chainId=${CHAIN_ID}`, headers });
    expect(transactions.statusCode).toBe(200);
    expect(events.statusCode).toBe(200);
    expect(transactions.json()[0].transaction_hash).toBe(TX);
    expect(events.json()[0].event_name).toBe("CompanyRegistered");
  });
});

if (!db) {
  afterAll(async () => app.close());
}
