# PayChad Source of Truth

| Data | Authority |
|---|---|
| Company ownership / privileged financial permissions | Monad contracts |
| Payroll funding and execution | Monad contracts |
| Token transfers | Monad / USDC contract |
| Transaction status | Monad, with backend indexing for UX |
| Event-derived history | Monad events, indexed into PostgreSQL |
| Employee metadata | PostgreSQL projection of on-chain employee state |
| Scheduling/job state | PostgreSQL + worker state when jobs are implemented |
| UI preferences | Application database when implemented |
| Network/contract configuration | `packages/config` + validated environment variables |
| JavaScript dependency graph | Root `pnpm-lock.yaml` |
| PostgreSQL schema | Versioned files under `apps/api/migrations/` |
| Event identity | `(chain_id, block_number, transaction_hash, log_index)` from Monad logs |
| Payroll run identity | `(chain_id, company_id, run_id)` from `PayrollRunCreated` |
| Payroll payment identity | `(chain_id, company_id, run_id, employee_id)` from `PayrollPayment` |

PostgreSQL is not a competing financial ledger. It stores queryable projections and coordination state that can be reconciled to Monad using chain, block, transaction and event identifiers.

The repository uses pnpm `10.15.1` as declared by the root `package.json` and a single workspace lockfile at the repository root. CI installs from the repository root with the frozen lockfile. The lockfile must be generated from the actual workspace manifests and committed; CI must not synthesize or bypass it.

The Phase 2A event domain is deterministic: viem decodes the current PayChadPayroll event ABI into typed domain events, and explicit event-specific persistence functions project those events into PostgreSQL. `indexed_events` and the applicable domain projection are committed in one PostgreSQL transaction. Exact event replay is idempotent after identity/payload verification; conflicting payloads fail closed.

Out-of-order events with missing prerequisites are rejected and rolled back rather than fabricating state. A future worker must retry after prerequisite events have been indexed. `PayrollFunded` and `PayrollWithdrawn` remain observable in `indexed_events.event_data` and do not create an off-chain payroll balance.

Off-chain data must never silently override authoritative on-chain financial state.
