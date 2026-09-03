# PayChad Repository Map

## Baseline
- Repository: `juicyblxst-lang/paychad`
- Default branch: `main`
- Initial baseline commit: `76f59c53f575312b0d330f3f7a30054241e4bfe9`
- Starting state: empty repository; no pre-existing application code, branches, commits, PRs, CI, contracts, frontend, backend, or database schema were present.

## Target structure
```text
apps/
  web/        Next.js frontend
  api/        PayChad API, indexer and jobs
packages/
  contracts/  Foundry Solidity contracts
  config/     shared chain/environment configuration
  domain/     shared TypeScript domain types
  ui/         shared UI primitives where justified
infra/
  docker/     local infrastructure helpers
  render/     Render service configuration
  vercel/     Vercel deployment notes/configuration
.github/
  workflows/
docs/
```

This map is a target, not evidence that every component has already been implemented. Update it whenever the repository materially changes.
