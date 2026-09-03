# PayChad Repository Map

## Current state
- Repository: `juicyblxst-lang/paychad`
- Default branch: `main`
- Current Phase 1 baseline: PostgreSQL persistence foundation added; event indexer, business API and jobs are not yet implemented.

## Implemented structure
```text
apps/
  web/        Next.js frontend and wallet/contract interaction UI
  api/        Fastify API, database connection, migration runner and schema validation
    migrations/  forward-only PostgreSQL migrations
packages/
  contracts/  Foundry Solidity contracts
  config/     shared Monad network/environment configuration
.github/
  workflows/  CI including isolated PostgreSQL schema validation
```

The repository map describes actual implemented paths, not aspirational directories. Update it when a new subsystem is actually added.
