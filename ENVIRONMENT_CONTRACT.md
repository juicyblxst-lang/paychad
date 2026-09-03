# PayChad Environment Contract

## Frontend (`apps/web`)

| Variable | Required | Public | Consumer | Purpose |
|---|---|---|---|---|
| `NEXT_PUBLIC_PAYCHAD_CONTRACT_ADDRESS` | production | yes | Next.js client | Verified PayChad contract on Monad mainnet |
| `NEXT_PUBLIC_PAYCHAD_TESTNET_CONTRACT_ADDRESS` | testnet | yes | Next.js client | Verified PayChad contract on Monad testnet |

Network IDs, RPC endpoints, explorer URLs and official USDC addresses are centralized in `packages/config` and consumed by the frontend configuration adapter.

## Backend (`apps/api`)

| Variable | Required | Public | Consumer | Purpose |
|---|---|---|---|---|
| `PORT` | no | no | Fastify | Listening port; defaults to `3001` locally |
| `DATABASE_URL` | database operations | no | API/migrations/indexer | Dedicated PayChad PostgreSQL connection string; never exposed to the client |

The API health endpoint does not require a database connection. Database-dependent commands and future database-dependent services fail clearly when `DATABASE_URL` is missing.

## Contracts (`packages/contracts`)

Deployment requires `USDC_ADDRESS` in the deployment shell. It is read by `script/Deploy.s.sol` and is never committed.

## Rules

- Never commit secrets or private keys.
- Never expose server secrets through `NEXT_PUBLIC_*` variables.
- Contract addresses are configuration, not source-code constants.
- `DATABASE_URL` is server-only and must point to a dedicated PayChad PostgreSQL instance; do not reuse unrelated databases.
- Every deployment must record the chain ID, USDC address, contract address, compiler/toolchain versions and transaction hash.
- Production must fail clearly when required configuration is missing rather than silently falling back to another environment.
