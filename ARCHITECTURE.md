# PayChad Architecture

## Principle
PayChad is a Monad-native programmable stablecoin payroll and business-payout platform. Blockchain state is authoritative for financial state; the backend coordinates indexing, metadata, scheduling, auditability and optimized reads.

## Initial system
```text
Browser / Next.js
   | wallet writes + application reads
   v
Wagmi / viem ---------> Monad
                           | EmployeeRegistry / PayrollManager / USDC
                           v
                        Events
                           |
                           v
                      PayChad API
                           |
                    Indexer / Jobs
                           |
                           v
                       PostgreSQL
                           |
                           v
                         Web UI
```

## Boundaries
- `apps/web`: presentation, wallet UX, client-side blockchain interactions and server-rendered application surfaces.
- `apps/api`: HTTP API, event indexing, transaction tracking and idempotent jobs.
- `packages/contracts`: Solidity source, tests and deployment tooling.
- `packages/config`: one authoritative network/address configuration model.
- `packages/domain`: shared non-sensitive domain contracts between frontend and backend.

No financial balance stored only in PostgreSQL is authoritative. Database records must carry blockchain identifiers when representing on-chain activity.
