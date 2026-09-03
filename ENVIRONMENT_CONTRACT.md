# PayChad Environment Contract

## Frontend (`apps/web`)

| Variable | Required | Public | Consumer | Purpose |
|---|---|---|---|---|
| `NEXT_PUBLIC_PAYCHAD_CONTRACT_ADDRESS` | production | yes | Next.js client | Verified PayChad contract on Monad mainnet |
| `NEXT_PUBLIC_PAYCHAD_TESTNET_CONTRACT_ADDRESS` | testnet | yes | Next.js client | Verified PayChad contract on Monad testnet |

Network IDs, RPC endpoints, explorer URLs and official USDC addresses are centralized in `packages/config` and consumed by the frontend configuration adapter.

## Backend (`apps/api`)

`PORT` is optional locally and defaults to `3001`. Production infrastructure should provide the listening port assigned by the platform.

Future database/indexer variables must be server-only and documented here before use.

## Contracts (`packages/contracts`)

Deployment requires `USDC_ADDRESS` in the deployment shell. It is read by `script/Deploy.s.sol` and is never committed.

## Rules

- Never commit secrets or private keys.
- Never expose server secrets through `NEXT_PUBLIC_*` variables.
- Contract addresses are configuration, not source-code constants.
- Every deployment must record the chain ID, USDC address, contract address, compiler/toolchain versions and transaction hash.
- Production must fail clearly when required configuration is missing rather than silently falling back to another environment.
