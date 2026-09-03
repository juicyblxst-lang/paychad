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

Off-chain data must never silently override authoritative on-chain financial state.
