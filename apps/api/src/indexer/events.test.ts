import { encodeAbiParameters, encodeEventTopics, type AbiParameter, type Address, type Hex } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/database";
import { decodePayChadEvent, payChadPayrollEvents, type PayChadDomainEvent, type RawBlockchainLog } from "./events";
import { persistPayChadEvent, persistPayChadEvents } from "./persist";

const CHAIN_ID = 31337n;
const CONTRACT = "0x3333333333333333333333333333333333333333" as Address;
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const EMPLOYEE = "0x2222222222222222222222222222222222222222" as Address;
const BLOCK_HASH = `0x${"55".repeat(32)}` as Hex;
const TX = (suffix: number) => (`0x${suffix.toString(16).padStart(2, "0").repeat(32)}`) as Hex;

function encodedLog<T extends (typeof payChadPayrollEvents)[number]["name"]>(eventName: T, args: readonly unknown[], nonIndexed: readonly AbiParameter[], values: readonly unknown[], logIndex = 0n, transactionHash: Hex = TX(44), transactionIndex = 0): RawBlockchainLog {
  const topics = encodeEventTopics({ abi: payChadPayrollEvents, eventName, args: args as never });
  const data = nonIndexed.length === 0 ? "0x" : encodeAbiParameters(nonIndexed, values as never);
  return { chainId: CHAIN_ID, blockNumber: 100n, blockHash: BLOCK_HASH, transactionHash, transactionIndex, logIndex, address: CONTRACT, topics: topics as readonly Hex[], data };
}
function companyEvent(logIndex = 0n, transactionHash = TX(1), transactionIndex = 0): RawBlockchainLog { return encodedLog("CompanyRegistered", [1n, OWNER], [{ type: "string" }], ["PayChad"], logIndex, transactionHash, transactionIndex); }
function employeeEvent(logIndex = 0n, transactionHash = TX(2), transactionIndex = 1, employeeId = 1n): RawBlockchainLog { return encodedLog("EmployeeAdded", [1n, employeeId, EMPLOYEE], [{ type: "uint256" }], [250000000n], logIndex, transactionHash, transactionIndex); }
function statusEvent(active: boolean, logIndex = 0n, transactionHash = TX(3), transactionIndex = 2, employeeId = 1n): RawBlockchainLog { return encodedLog("EmployeeStatusChanged", [1n, employeeId], [{ type: "bool" }], [active], logIndex, transactionHash, transactionIndex); }
function fundedEvent(logIndex = 0n, transactionHash = TX(4), transactionIndex = 3): RawBlockchainLog { return encodedLog("PayrollFunded", [1n, OWNER], [{ type: "uint256" }], [1000000000n], logIndex, transactionHash, transactionIndex); }
function runCreatedEvent(logIndex = 0n, transactionHash = TX(5), transactionIndex = 4, runId = 1n): RawBlockchainLog { return encodedLog("PayrollRunCreated", [1n, runId], [], [], logIndex, transactionHash, transactionIndex); }
function paymentEvent(logIndex = 0n, transactionHash = TX(6), transactionIndex = 5, employeeId = 1n): RawBlockchainLog { return encodedLog("PayrollPayment", [1n, 1n, employeeId], [{ type: "address" }, { type: "uint256" }], [EMPLOYEE, 250000000n], logIndex, transactionHash, transactionIndex); }
function completedEvent(logIndex = 0n, transactionHash = TX(6), transactionIndex = 5, totalPaid = 250000000n, employeeCount = 1n): RawBlockchainLog { return encodedLog("PayrollRunCompleted", [1n, 1n], [{ type: "uint256" }, { type: "uint256" }], [totalPaid, employeeCount], logIndex, transactionHash, transactionIndex); }
function withdrawnEvent(logIndex = 0n, transactionHash = TX(7), transactionIndex = 6): RawBlockchainLog { return encodedLog("PayrollWithdrawn", [1n, OWNER], [{ type: "uint256" }], [750000000n], logIndex, transactionHash, transactionIndex); }

const TEST_EVENTS = [companyEvent(), employeeEvent(), statusEvent(false), fundedEvent(), runCreatedEvent(), paymentEvent(0n), completedEvent(1n), withdrawnEvent()];
function expectEvent(log: RawBlockchainLog, expected: Partial<PayChadDomainEvent>) { expect(decodePayChadEvent(log)).toMatchObject(expected); }

describe("PayChad event decoder", () => {
  it("decodes all eight contract events with exact integer amounts", () => {
    expectEvent(companyEvent(), { kind: "CompanyRegistered", companyId: 1n, owner: OWNER, name: "PayChad" });
    expectEvent(employeeEvent(), { kind: "EmployeeAdded", companyId: 1n, employeeId: 1n, wallet: EMPLOYEE, salary: 250000000n });
    expectEvent(statusEvent(false), { kind: "EmployeeStatusChanged", companyId: 1n, employeeId: 1n, active: false });
    expectEvent(fundedEvent(), { kind: "PayrollFunded", companyId: 1n, funder: OWNER, amount: 1000000000n });
    expectEvent(runCreatedEvent(), { kind: "PayrollRunCreated", companyId: 1n, runId: 1n });
    expectEvent(paymentEvent(), { kind: "PayrollPayment", companyId: 1n, runId: 1n, employeeId: 1n, recipient: EMPLOYEE, amount: 250000000n });
    expectEvent(completedEvent(1n), { kind: "PayrollRunCompleted", companyId: 1n, runId: 1n, totalPaid: 250000000n, employeeCount: 1n });
    expectEvent(withdrawnEvent(), { kind: "PayrollWithdrawn", companyId: 1n, recipient: OWNER, amount: 750000000n });
  });

  it("rejects malformed and unsupported logs", () => {
    expect(() => decodePayChadEvent({ ...companyEvent(), topics: ["0x1234"] })).toThrow();
    expect(() => decodePayChadEvent({ ...companyEvent(), data: "0x12" })).toThrow();
    expect(() => decodePayChadEvent({ ...companyEvent(), topics: [] })).toThrow();
  });

  it("allows RPC metadata to be absent during decoding", () => {
    expect(decodePayChadEvent({ ...companyEvent(), blockHash: null, transactionIndex: null })).toMatchObject({ kind: "CompanyRegistered" });
  });
});

describe.skipIf(!process.env.DATABASE_URL)("PayChad event persistence", () => {
  let db: Database;

  beforeAll(async () => { db = createDatabase(); await db`SELECT 1`; });
  beforeEach(async () => { await db`TRUNCATE payroll_payments, payroll_runs, employees, companies, indexed_events, blockchain_transactions RESTART IDENTITY CASCADE`; });
  afterAll(async () => { await db.end({ timeout: 5 }); });

  it("maps all eight events and replays every event idempotently", async () => {
    const events = TEST_EVENTS.map(decodePayChadEvent);
    await persistPayChadEvents(db, events);
    for (const event of events) expect(await persistPayChadEvent(db, event)).toBe("replayed");

    const [{ count: eventCount }] = await db`SELECT count(*) FROM indexed_events WHERE chain_id = ${CHAIN_ID.toString()}`;
    const [{ count: companyCount }] = await db`SELECT count(*) FROM companies WHERE chain_id = ${CHAIN_ID.toString()}`;
    const [{ count: employeeCount }] = await db`SELECT count(*) FROM employees WHERE chain_id = ${CHAIN_ID.toString()}`;
    const [{ count: runCount }] = await db`SELECT count(*) FROM payroll_runs WHERE chain_id = ${CHAIN_ID.toString()}`;
    const [{ count: paymentCount }] = await db`SELECT count(*) FROM payroll_payments WHERE chain_id = ${CHAIN_ID.toString()}`;
    expect(eventCount).toBe("8"); expect(companyCount).toBe("1"); expect(employeeCount).toBe("1"); expect(runCount).toBe("1"); expect(paymentCount).toBe("1");

    const [payment] = await db`SELECT amount_base_units::text AS amount FROM payroll_payments WHERE chain_id = ${CHAIN_ID.toString()}`;
    expect(payment?.amount).toBe("250000000");
    const [funded] = await db`SELECT event_data::text AS event_data FROM indexed_events WHERE chain_id = ${CHAIN_ID.toString()} AND event_name = 'PayrollFunded'`;
    const fundedData = funded?.event_data ? JSON.parse(funded.event_data) as { args?: { amount?: string } } : undefined;
    expect(fundedData?.args?.amount).toBe("1000000000");
  });

  it("aggregates multiple completion events for one payroll run exactly once per event", async () => {
    await persistPayChadEvents(db, [
      decodePayChadEvent(companyEvent()),
      decodePayChadEvent(employeeEvent()),
      decodePayChadEvent(runCreatedEvent()),
      decodePayChadEvent(completedEvent(1n, TX(6), 5, 250000000n, 1n)),
      decodePayChadEvent(completedEvent(2n, TX(8), 8, 300000000n, 1n)),
    ]);
    await expect(persistPayChadEvent(db, decodePayChadEvent(completedEvent(2n, TX(8), 8, 300000000n, 1n)))).resolves.toBe("replayed");
    const [run] = await db`SELECT total_paid_base_units::text AS total_paid, employee_count::text AS employee_count FROM payroll_runs WHERE chain_id = ${CHAIN_ID.toString()} AND company_id = '1' AND run_id = '1'`;
    expect(run?.total_paid).toBe("550000000");
    expect(run?.employee_count).toBe("2");
  });

  it("preserves identifiers beyond signed bigint range", async () => {
    const wideEmployeeId = 9223372036854775808n;
    await persistPayChadEvents(db, [decodePayChadEvent(companyEvent()), decodePayChadEvent(employeeEvent(50n, TX(50), 50, wideEmployeeId))]);
    const [employee] = await db`SELECT employee_id::text AS employee_id FROM employees WHERE chain_id = ${CHAIN_ID.toString()} AND company_id = '1'`;
    expect(employee?.employee_id).toBe(wideEmployeeId.toString());
  });

  it("handles multiple logs from one transaction without collision", async () => {
    const events = [decodePayChadEvent(companyEvent(20n, TX(20), 20)), decodePayChadEvent(employeeEvent(21n, TX(20), 20))];
    await persistPayChadEvents(db, events);
    const [{ count }] = await db`SELECT count(*) FROM indexed_events WHERE chain_id = ${CHAIN_ID.toString()} AND transaction_hash = ${TX(20)}`;
    expect(count).toBe("2");
  });

  it("rolls back the indexed event when a prerequisite projection fails", async () => {
    const invalid = decodePayChadEvent(statusEvent(true, 30n, TX(30), 30));
    await expect(persistPayChadEvent(db, invalid)).rejects.toThrow("prerequisite employee");
    const [{ count }] = await db`SELECT count(*) FROM indexed_events WHERE chain_id = ${CHAIN_ID.toString()} AND log_index = 30`;
    expect(count).toBe("0");
  });

  it("fails closed for out-of-order payroll payment prerequisites", async () => {
    const payment = decodePayChadEvent(paymentEvent(40n, TX(40), 40));
    await expect(persistPayChadEvent(db, payment)).rejects.toThrow();
    const [{ count }] = await db`SELECT count(*) FROM indexed_events WHERE chain_id = ${CHAIN_ID.toString()} AND log_index = 40`;
    expect(count).toBe("0");
  });
});