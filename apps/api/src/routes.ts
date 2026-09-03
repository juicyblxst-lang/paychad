import type { FastifyInstance } from "fastify";
import type { Database } from "./db/database";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export class ApiError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}

function requireDb(db: Database | undefined): Database {
  if (!db) throw new ApiError(503, "CONFIGURATION_ERROR", "Database is not configured");
  return db;
}

function requireWallet(value: unknown): string {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) throw new ApiError(400, "VALIDATION_ERROR", "A valid wallet address is required");
  return value.toLowerCase();
}

function requireChain(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value) || BigInt(value) <= 0n) throw new ApiError(400, "VALIDATION_ERROR", "A positive chainId is required");
  return value;
}

function requireCompanyId(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value) || BigInt(value) <= 0n) throw new ApiError(400, "VALIDATION_ERROR", "companyId must be a positive decimal integer");
  return value;
}

async function authorizeCompany(db: Database, chainId: string, companyId: string, wallet: string): Promise<void> {
  const [company] = await db<{ owner_address: string }[]>`
    SELECT owner_address FROM companies
    WHERE chain_id = ${chainId} AND company_id = ${companyId} AND lower(owner_address) = ${wallet}
    LIMIT 1
  `;
  if (!company) throw new ApiError(404, "AUTH_ERROR", "Company not found for wallet");
}

export function registerApiRoutes(app: FastifyInstance, db?: Database): void {
  app.get("/v1/companies", async (request) => {
    const database = requireDb(db);
    const query = request.query as { owner?: unknown; chainId?: unknown };
    const owner = requireWallet(query.owner);
    const chainId = requireChain(query.chainId);
    return database`
      SELECT chain_id::text, company_id::text, owner_address, name, created_at::text
      FROM companies WHERE chain_id = ${chainId} AND lower(owner_address) = ${owner}
      ORDER BY created_at DESC
    `;
  });

  app.get("/v1/companies/:companyId/employees", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: unknown };
    const query = request.query as { chainId?: unknown };
    const chainId = requireChain(query.chainId);
    const companyId = requireCompanyId(params.companyId);
    const owner = requireWallet(request.headers["x-wallet-address"]);
    await authorizeCompany(database, chainId, companyId, owner);
    return database`
      SELECT employee_id::text, wallet_address, salary_base_units::text, active, created_at::text, updated_at::text
      FROM employees WHERE chain_id = ${chainId} AND company_id = ${companyId} ORDER BY employee_id ASC
    `;
  });

  app.get("/v1/companies/:companyId/payroll-runs", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: unknown };
    const query = request.query as { chainId?: unknown };
    const chainId = requireChain(query.chainId);
    const companyId = requireCompanyId(params.companyId);
    const owner = requireWallet(request.headers["x-wallet-address"]);
    await authorizeCompany(database, chainId, companyId, owner);
    return database`
      SELECT run_id::text, created_at::text, completed_at::text, total_paid_base_units::text, employee_count::text
      FROM payroll_runs WHERE chain_id = ${chainId} AND company_id = ${companyId} ORDER BY created_at DESC LIMIT 100
    `;
  });

  app.get("/v1/companies/:companyId/payments", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: unknown };
    const query = request.query as { chainId?: unknown };
    const chainId = requireChain(query.chainId);
    const companyId = requireCompanyId(params.companyId);
    const owner = requireWallet(request.headers["x-wallet-address"]);
    await authorizeCompany(database, chainId, companyId, owner);
    return database`
      SELECT run_id::text, employee_id::text, recipient_address, amount_base_units::text, block_number::text, transaction_hash, log_index::text, paid_at::text
      FROM payroll_payments WHERE chain_id = ${chainId} AND company_id = ${companyId} ORDER BY paid_at DESC LIMIT 200
    `;
  });

  app.get("/v1/companies/:companyId/events", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: unknown };
    const query = request.query as { chainId?: unknown };
    const chainId = requireChain(query.chainId);
    const companyId = requireCompanyId(params.companyId);
    const owner = requireWallet(request.headers["x-wallet-address"]);
    await authorizeCompany(database, chainId, companyId, owner);
    return database`
      SELECT block_number::text, transaction_hash, log_index::text, block_hash, contract_address, event_name, event_data, observed_at::text
      FROM indexed_events
      WHERE chain_id = ${chainId} AND event_data->'args'->>'companyId' = ${companyId}
      ORDER BY block_number DESC, log_index DESC LIMIT 200
    `;
  });

  app.get("/v1/companies/:companyId/transactions", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: unknown };
    const query = request.query as { chainId?: unknown };
    const chainId = requireChain(query.chainId);
    const companyId = requireCompanyId(params.companyId);
    const owner = requireWallet(request.headers["x-wallet-address"]);
    await authorizeCompany(database, chainId, companyId, owner);
    return database`
      SELECT DISTINCT bt.block_number::text, bt.transaction_hash, bt.block_hash, bt.transaction_index::text, bt.confirmed_at::text
      FROM blockchain_transactions bt
      JOIN indexed_events ie ON ie.chain_id = bt.chain_id AND ie.transaction_hash = bt.transaction_hash
      WHERE ie.chain_id = ${chainId} AND ie.event_data->'args'->>'companyId' = ${companyId}
      ORDER BY bt.block_number DESC, bt.transaction_index DESC LIMIT 200
    `;
  });

  app.get("/v1/indexer/status", async () => {
    const database = requireDb(db);
    const [row] = await database<{ last_processed_block: string | null; updated_at: string | null }[]>`
      SELECT last_processed_block::text, updated_at::text FROM indexer_checkpoints ORDER BY updated_at DESC LIMIT 1
    `;
    return { status: row ? "ok" : "starting", checkpoint: row?.last_processed_block ?? null, updatedAt: row?.updated_at ?? null };
  });
}
