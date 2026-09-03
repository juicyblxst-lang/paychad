# PayChad Change Impact

Before significant changes, identify affected layers:

- contracts and ABI
- frontend hooks/services/UI
- backend API/indexer/jobs
- database schema/migrations
- shared configuration/types
- CI
- Vercel/Render deployment
- tests
- concurrent branches/PRs

After a change, run targeted validation followed by the broadest practical checks. Preserve working behavior unless the change explicitly replaces it with a safer/correct implementation.

For an empty repository, the first architecture commit establishes the baseline against which future impact is measured.
