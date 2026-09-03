# PayChad Source of Truth

| Data | Authority |
|---|---|
| Company ownership / privileged financial permissions | Monad contracts |
| Payroll funding and execution | Monad contracts |
| Token transfers | Monad / USDC contract |
| Transaction status | Monad, with backend indexing for UX |
| Event-derived history | Monad events, indexed into PostgreSQL |
| Employee metadata | PostgreSQL, with on-chain identity/permission references where applicable |
| Scheduling/job state | PostgreSQL + worker state |
| UI preferences | Application database |
| Network/contract configuration | `packages/config` + validated environment variables |
| JavaScript dependency graph | Root `pnpm-lock.yaml` |

The repository uses pnpm `10.15.1` as declared by the root `package.json` and a single workspace lockfile at the repository root. CI installs from the repository root with the frozen lockfile. The lockfile must be generated from the actual workspace manifests and committed; CI must not synthesize or bypass it.

Off-chain data must never silently override authoritative on-chain financial state.
