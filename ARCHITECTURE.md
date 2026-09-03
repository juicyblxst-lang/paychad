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

Fastify API
   |
   | health endpoint only today
   v
PostgreSQL foundation
   |
   +-- companies
   +-- employees
   +-- payroll_runs
   +-- payroll_payments
   +-- blockchain_transactions
   +-- indexed_events
   +-- indexer_checkpoints
   +-- idempotency_keys
```

The event indexer, business API, scheduler/jobs and frontend history integration are not implemented yet. Phase 1 establishes their durable database boundary without implementing those systems.

## Boundaries
- `apps/web`: presentation, wallet UX and direct client-side blockchain interactions.
- `apps/api`: Fastify HTTP service plus the database connection and migration foundation. Business endpoints/indexing/jobs remain future work.
- `apps/api/migrations`: forward-only PostgreSQL migrations applied by the API migration runner.
- `packages/contracts`: Solidity source, tests and deployment tooling.
- `packages/config`: one authoritative network/address configuration model.

## Financial boundary
Monad contracts remain authoritative for company ownership, payroll funding, payroll execution and token movement. PostgreSQL never maintains an independent financial balance or ledger. Rows representing on-chain activity retain chain and transaction/event identifiers so they can be reconciled to Monad.

## Persistence boundary
The database is intentionally a projection/coordination store. Company and employee rows represent indexed contract state; payroll run/payment rows represent emitted contract events; blockchain transaction and indexed event rows preserve observation identity; checkpoints support future indexer progress; idempotency keys support future retry-safe backend mutations.
