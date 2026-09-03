import type { FastifyInstance } from "fastify";
import type { Database } from "./db/database";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function requireWallet(value: unknown): string {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) throw new ApiError(400, "VALIDATION_ERROR", "A valid wallet address is required");
  return value.toLowerCase();
}

function requireDb(db: Database | undefined): Database {
  if (!db) throw new ApiError(503, "CONFIGURATION_ERROR", "Database is not configured");
  return db;
}

export class ApiError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function registerApiRoutes(app: FastifyInstance, db?: Database): void {
  app.get("/v1/companies", async (request) => {
    const database = requireDb(db);
    const owner = requireWallet((request.query as { owner?: unknown }).owner);
    return database<{ chain_id: string; company_id: string; owner_address: string; name: string; created_at: string }[]>`
      SELECT chain_id::text, company_id::text, owner_address, name, created_at::text
      FROM companies WHERE chain_id > 0 AND lower(owner_address) = ${owner}
      ORDER BY created_at DESC
    `;
  });

  app.get("/v1/companies/:companyId/employees", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: string };
    const owner = requireWallet(request.headers["x-wallet-address"]);
    if (!params.companyId || !/^\d+$/.test(params.companyId)) throw new ApiError(400, "VALIDATION_ERROR", "companyId must be a decimal integer");
    const [company] = await database<{ owner_address: string }[]>`
      SELECT owner_address FROM companies WHERE company_id = ${params.companyId} AND lower(owner_address) = ${owner} LIMIT 1
    `;
    if (!company) throw new ApiError(404, "AUTH_ERROR", "Company not found for wallet");
    return database`
      SELECT employee_id::text, wallet_address, salary_base_units::text, active, created_at::text, updated_at::text
      FROM employees WHERE company_id = ${params.companyId} ORDER BY employee_id ASC
    `;
  });

  app.get("/v1/companies/:companyId/payroll-runs", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: string };
    const owner = requireWallet(request.headers["x-wallet-address"]);
    if (!params.companyId || !/^\d+$/.test(params.companyId)) throw new ApiError(400, "VALIDATION_ERROR", "companyId must be a decimal integer");
    const [company] = await database<{ owner_address: string }[]>`
      SELECT owner_address FROM companies WHERE company_id = ${params.companyId} AND lower(owner_address) = ${owner} LIMIT 1
    `;
    if (!company) throw new ApiError(404, "AUTH_ERROR", "Company not found for wallet");
    return database`
      SELECT run_id::text, created_at::text, completed_at::text, total_paid_base_units::text, employee_count::text
      FROM payroll_runs WHERE company_id = ${params.companyId} ORDER BY created_at DESC LIMIT 100
    `;
  });

  app.get("/v1/companies/:companyId/payments", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: string };
    const owner = requireWallet(request.headers["x-wallet-address"]);
    if (!params.companyId || !/^\d+$/.test(params.companyId)) throw new ApiError(400, "VALIDATION_ERROR", "companyId must be a decimal integer");
    const [company] = await database<{ owner_address: string }[]>`
      SELECT owner_address FROM companies WHERE company_id = ${params.companyId} AND lower(owner_address) = ${owner} LIMIT 1
    `;
    if (!company) throw new ApiError(404, "AUTH_ERROR", "Company not found for wallet");
    return database`
      SELECT run_id::text, employee_id::text, recipient_address, amount_base_units::text, block_number::text, transaction_hash, log_index::text, paid_at::text
      FROM payroll_payments WHERE company_id = ${params.companyId} ORDER BY paid_at DESC LIMIT 200
    `;
  });

  app.get("/v1/companies/:companyId/events", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: string };
    const owner = requireWallet(request.headers["x-wallet-address"]);
    if (!params.companyId || !/^\d+$/.test(params.companyId)) throw new ApiError(400, "VALIDATION_ERROR", "companyId must be a decimal integer");
    const [company] = await database<{ owner_address: string }[]>`
      SELECT owner_address FROM companies WHERE company_id = ${params.companyId} AND lower(owner_address) = ${owner} LIMIT 1
    `;
    if (!company) throw new ApiError(404, "AUTH_ERROR", "Company not found for wallet");
    return database`
      SELECT ie.block_number::text, ie.transaction_hash, ie.log_index::text, ie.block_hash, ie.contract_address, ie.event_name, ie.event_data, ie.observed_at::text
      FROM indexed_events ie
      WHERE ie.event_data->'args'->>'companyId' = ${params.companyId}
      ORDER BY ie.block_number DESC, ie.log_index DESC LIMIT 200
    `;
  });

  app.get("/v1/companies/:companyId/transactions", async (request) => {
    const database = requireDb(db);
    const params = request.params as { companyId?: string };
    const owner = requireWallet(request.headers["x-wallet-address"]);
    if (!params.companyId || !/^\d+$/.test(params.companyId)) throw new ApiError(400, "VALIDATION_ERROR", "companyId must be a decimal integer");
    const [company] = await database<{ owner_address: string }[]>`
      SELECT owner_address FROM companies WHERE company_id = ${params.companyId} AND lower(owner_address) = ${owner} LIMIT 1
    `;
    if (!company) throw new ApiError(404, "AUTH_ERROR", "Company not found for wallet");
    return database`
      SELECT DISTINCT bt.block_number::text, bt.transaction_hash, bt.block_hash, bt.transaction_index::text, bt.confirmed_at::text
      FROM blockchain_transactions bt
      JOIN indexed_events ie ON ie.chain_id = bt.chain_id AND ie.transaction_hash = bt.transaction_hash
      WHERE ie.event_data->'args'->>'companyId' = ${params.companyId}
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
