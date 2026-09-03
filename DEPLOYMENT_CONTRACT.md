# PayChad Deployment Contract

## Web
Deploy the Next.js application to Vercel with production environment variables validated against the selected Monad network.

## API / worker
Deploy the PayChad API and any indexer/job worker to Render. Health endpoints must be available and startup must fail clearly when required configuration is absent. A worker is only required once persistent indexing or scheduled jobs are implemented.

## Database
Use a dedicated PayChad PostgreSQL instance. Never reuse an unrelated workspace database. Apply the repository migrations before serving database-dependent production traffic. `DATABASE_URL` is server-only.

Phase 1 provides the migration runner and schema foundation but does not provision or connect production PostgreSQL.

## Contracts
Contracts are deployed independently to Monad. Deployment artifacts record chain ID, addresses, compiler/toolchain versions and transaction hashes where available.

Deployment is not considered verified until a production smoke test confirms the deployed frontend, backend, contracts and indexing path work together.
