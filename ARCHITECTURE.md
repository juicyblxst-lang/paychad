# PayChad Architecture

## Principle
PayChad is a Monad-native programmable stablecoin payroll and business-payout platform. Blockchain state is authoritative for financial state; PostgreSQL is an off-chain projection and coordination store for indexed history, metadata, checkpoints and idempotency.

## Current implemented system
```text
Browser / Next.js
   |
   | wallet writes + on-chain reads
   v
Wagmi / viem ---------> Monad
                           |
                           | PayChadPayroll + USDC
                           v
                        Events
                           |
                           v
                 typed event decoder
                           |
                           v
                deterministic domain events
                           |
                           v
                atomic PostgreSQL projection
                           |
             +-------------+-------------+
             |                           |
             v                           v
        indexed_events             domain tables

Fastify API
   |
   +-- health endpoint
   +-- PostgreSQL foundation

PostgreSQL
   +-- companies
   +-- employees
   +-- payroll_runs
   +-- payroll_payments
   +-- blockchain_transactions
   +-- indexed_events
   +-- indexer_checkpoints
   +-- idempotency_keys
```

Phase 2A implements deterministic decoding and atomic event-to-projection persistence, but does not implement a live RPC scanner, worker, scheduler, or public indexing API.

## Event indexing boundary
`apps/api/src/indexer/events.ts` is the blockchain-to-domain boundary. It uses the current PayChadPayroll event ABI definitions and viem decoding. RPC/log transport is intentionally outside this layer.

`apps/api/src/indexer/persist.ts` maps each supported domain event explicitly to the PostgreSQL projection. A persistence operation writes `blockchain_transactions` and `indexed_events` plus any applicable domain projection in one PostgreSQL transaction. An exact replay is a no-op after identity and payload verification. Conflicting data for an existing blockchain event identity fails closed.

Projection prerequisites are strict: employee status changes require an indexed employee; payroll payments require the indexed company, run and employee; payroll completion requires the indexed run. Missing prerequisites cause the transaction to roll back instead of fabricating state. Batched events are ordered by block, transaction index and log index before projection so same-transaction logs can be processed deterministically.

## Boundaries
- `apps/web`: presentation, wallet UX and direct client-side blockchain interactions.
- `apps/api`: Fastify HTTP service, database foundation, deterministic event domain and persistence boundary. Live indexing/jobs remain future work.
- `apps/api/migrations`: forward-only PostgreSQL migrations applied by the API migration runner.
- `apps/api/src/indexer/events.ts`: typed ABI decoding and domain mapping input.
- `apps/api/src/indexer/persist.ts`: atomic domain projection persistence.
- `packages/contracts`: Solidity source, tests and deployment tooling.
- `packages/config`: one authoritative network/address configuration model.

## Financial boundary
Monad contracts remain authoritative for company ownership, payroll funding, payroll execution and token movement. PostgreSQL never maintains an independent financial balance or ledger. `PayrollFunded` and `PayrollWithdrawn` are durably observable through `indexed_events.event_data`; they do not create a synthetic off-chain balance.

## Persistence boundary
The database is intentionally a projection/coordination store. Company and employee rows represent indexed contract state; payroll run/payment rows represent emitted contract events; blockchain transaction and indexed event rows preserve observation identity; checkpoints support future indexer progress; idempotency keys support future retry-safe backend mutations.

## Ordering and replay
Blockchain event identity is `(chain_id, block_number, transaction_hash, log_index)`. Payroll run identity is `(chain_id, company_id, run_id)`. Payroll payment identity is `(chain_id, company_id, run_id, employee_id)`. Replaying the same event is idempotent. Out-of-order events that require missing prerequisite projections fail and roll back, allowing a future indexer to retry after earlier blocks/events are available.
