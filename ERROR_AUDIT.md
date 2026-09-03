# PayChad Historical Error Audit

Audit date: 2026-09-03

Audited source: `main` and GitHub Actions history for the PayChad repository.

## 1. Executive Summary

The historical record is substantially larger than the latest red CI line suggests.

- GitHub Actions workflow runs observed: **119**.
- Failed workflow-run occurrences: **86**.
- Successful workflow-run occurrences: **33**.
- Main `CI` workflow runs: **114**.
- Main `CI` failures: **83**.
- Main `CI` successes: **31**.
- Temporary `Bootstrap Lockfile` failures: **3**.
- Temporary `Refresh Lockfile` successes: **2**.
- Pull requests/alternate branches currently present: **none**; only `main` exists.

The 86 failed workflow runs are **occurrences, not 86 independent bugs**. The history clusters into a much smaller set of underlying causes. The audit identifies **23 root-cause families** with high confidence, plus several current latent risks discovered by code inspection.

The most important pattern is a transition from repository/bootstrap failures, through frontend/API/contract integration failures, into Phase 1 PostgreSQL failures, and finally a dense Phase 2A indexer/type/persistence failure cluster. The latter contains many consecutive manifestations of a small number of type-boundary and PostgreSQL serialization issues.

The latest known failure is not evidence that all of Phase 2A is broken: the current failure is a TypeScript JSON-value typing boundary in `persist.ts`. More importantly, current code inspection uncovered a concrete contract/schema semantic mismatch: `executePayroll` can emit multiple `PayrollRunCompleted` events for the same run, while the Phase 1 projection currently models only one completion. That must be fixed before production indexing.

## 2. Root Cause Table

| ID | Subsystem | Root cause | First seen | Last seen | Occurrences | Status | Resolution / evidence |
|---|---|---|---|---|---:|---|---|
| ROOT-01 | CI | Initial runner/runtime setup could not complete the Node setup step | CI #1 | CI #1 | 1 | RESOLVED | Later CI runs completed setup; no recurrence observed |
| ROOT-02 | CI/lockfile | Bootstrap workflow was trying to solve a missing/non-canonical root lockfile and evolved through cache/bootstrap ordering problems | Bootstrap #1 | Bootstrap #4 | 3 failed bootstrap occurrences | RESOLVED | Canonical root `pnpm-lock.yaml` policy and normal frozen installs are now used; temporary bootstrap workflow removed |
| ROOT-03 | CI | Node/package-manager bootstrap configuration was coupled incorrectly to the temporary lockfile workflow | early bootstrap period | early bootstrap period | multiple | RESOLVED | Runner Node and pnpm setup were separated from lockfile generation; temporary workflow removed |
| ROOT-04 | API | Production/runtime scripts initially did not point at the actual process entrypoint | API/server bring-up | `74e9110` | repeated across bring-up | RESOLVED | `start` now targets `dist/index.js`; later health test exists |
| ROOT-05 | WEB/CONFIG | Workspace shared config was not consumable by web consumers because declarations/build ordering were incomplete | shared-config introduction | `42e7703` | repeated | RESOLVED | Config package emits declarations and CI builds it before web validation |
| ROOT-06 | API/CI | ESLint was referenced but not declared/locked in the API package | `1f7cebbe` predecessor | `1f7cebbe` | 1 fix cycle | RESOLVED | `eslint` restored to API devDependencies and lockfile |
| ROOT-07 | WEB | Contract tuple/object results were consumed with incorrect positional assumptions instead of named fields | dashboard contract integration | `ad819741` | repeated | RESOLVED | Dashboard now uses named contract fields |
| ROOT-08 | CONTRACT/WEB | Payroll balance tuple access did not match the actual returned struct shape | contract/dashboard integration | `ae6ecdcb` | 1 fix cycle | RESOLVED | Contract return is consumed as the actual named struct |
| ROOT-09 | CONTRACT | Unauthorized-caller test did not actually exercise the intended caller boundary | contract security tests | `8e00373` | `8e00373` | 1 fix cycle | Test corrected; current contract suite passes |
| ROOT-10 | DB | `uint256` company IDs could not safely be represented using JS-number-like/smaller DB assumptions | Phase 1 schema | `afed2a2` | several | RESOLVED | Company IDs use exact PostgreSQL `NUMERIC(78,0)` and bigint values stay exact |
| ROOT-11 | DB/migration | Migration runner/module-mode and compiled-path assumptions did not initially match the API's NodeNext TypeScript configuration | `4192e89` predecessor | `4192e89` | multiple | RESOLVED | Runner now matches current module mode and migration discovery path |
| ROOT-12 | DB/test | Schema validation tests mishandled PostgreSQL transaction-abort behavior after expected constraint errors | initial schema validation | `a882aa7` | multiple | RESOLVED | Negative cases use independent transactions; unexpected errors now fail validation |
| ROOT-13 | DB/test | Schema-validation row lookups/transaction result typing were insufficiently guarded | `f1a807e` | `410a245` | multiple | RESOLVED | Result access and transaction typing were hardened |
| ROOT-14 | DB/schema | Event history initially did not retain complete decoded event payloads needed for funding/withdrawal observability | Phase 1 schema validation | `d53d390` | several | RESOLVED | `indexed_events.event_data JSONB NOT NULL` now stores decoded payloads |
| ROOT-15 | INDEXER/VIEM | The decoder's ABI/event typing was unstable at the viem boundary | Phase 2A start | current | many | OPEN | Multiple fixes improved typing, but current branch still has a downstream JSON-value type failure |
| ROOT-16 | INDEXER | Decoder initially did not pass a complete RPC log metadata shape into viem | Phase 2A start | `ac28ccc` | repeated | RESOLVED | Full log metadata is now supplied; tests cover optional metadata |
| ROOT-17 | DB/INDEXER | PostgreSQL bigint parameter handling was incompatible with exact blockchain integer usage | Phase 2A | current | multiple | OPEN | Scalars are now passed as strings in tests, but the signed-BIGINT schema mismatch remains |
| ROOT-18 | DB/INDEXER | `blockchain_transactions` must exist before `indexed_events` because of the event FK | Phase 2A | `67c0440` | repeated | RESOLVED | Persistence now inserts/ensures transaction identity first |
| ROOT-19 | INDEXER | Replay/duplicate event handling needed concurrency-safe atomic behavior | Phase 2A | current | multiple | PARTIALLY RESOLVED | Atomic persistence and canonical event identity exist; final full-CI validation remains outstanding |
| ROOT-20 | INDEXER/DB | JSONB event payload serialization and replay equality had type/representation mismatches | Phase 2A | current | multiple | OPEN | Native JSONB serialization and exact-string amount assertions were added; latest CI still reports JSONValue typing |
| ROOT-21 | CI/INDEXER | CI started indexer integration tests before ensuring the schema migration had run | Phase 2A | `67bc838` | repeated | RESOLVED | CI now migrates before API tests and validates a second migration run |
| ROOT-22 | INDEXER/test | Integration tests introduced generic-query typing and bigint-parameter issues while proving exact persistence | Phase 2A | current | multiple | OPEN | Latest run still fails in TypeScript before test execution |
| ROOT-23 | CONTRACT/DB | `executePayroll` may emit multiple `PayrollRunCompleted` events for one run, but the Phase 1 `payroll_runs` projection treats completion as a single overwriteable record | contract inspection | current | latent | OPEN / P1 | Current contract source permits partial/disjoint execution of the same run; projection must aggregate completion observations rather than overwrite them |

## 3. CI Run Timeline

The Actions API reports **119 total workflow runs**, with **86 failed** and **33 successful**. The failures include the temporary lockfile workflows; the normal `CI` workflow accounts for 83 failures and 31 successes.

Selected transition evidence from the complete run history:

| Run | Commit | Result | Failure/transition | Interpretation |
|---|---|---|---|---|
| CI #1 | `62166e7` | FAILURE | `web` failed during `actions/setup-node` | Initial runner/setup failure, before project validation |
| Bootstrap #1 | `0f19fbe` | FAILURE | bootstrap workflow | Temporary lockfile/bootstrap path failed |
| Bootstrap #3 | `40a9901` | FAILURE | bootstrap workflow | Canonical workspace/lockfile bootstrap still broken |
| Bootstrap #4 | `02745b2` | FAILURE | bootstrap workflow | Cache/bootstrap ordering still broken |
| CI #22 | `116391c` | SUCCESS | wallet integration validation | First successful web integration milestone |
| CI #23 | `4b1c38d` | SUCCESS | landing experience | Web baseline remained green |
| CI #31 | `5394d9e` | FAILURE | shared-config/lockfile transition | Dependency graph/lockfile instability returned |
| CI #36 | `c3706b0` | FAILURE | contracts formatting | Formatting was part of CI failure surface |
| CI #37 | `9fa4941` | FAILURE | API/server refactor | Server construction/startup transition exposed CI/API failure |
| CI #64 | `e062ec3` | FAILURE | Phase 1 docs/schema transition | API/DB work had not yet stabilized |
| CI #65 | `191bdb2` | FAILURE | Phase 1 deployment docs | Same DB/API stabilization cluster |
| CI #75 | `d53d390` | SUCCESS | Phase 1 schema validation | Phase 1 reached a clean CI milestone |
| CI #76 onward | `468be33` and following Phase 2A commits | FAILURE cluster | decoder/persistence implementation | Phase 2A generated a dense sequence of related type/persistence failures |
| CI #88 | `c0379bd` | FAILURE | shared typed DB connection | Phase 2A DB typing boundary still unstable |
| CI #104 | `f7796fa` | FAILURE | scalar bigint + JSONB serialization | Exact integer/JSONB boundary still unstable |
| CI #105 | `f33446b` | FAILURE | bigint test parameters | Test-side parameter typing remained broken |
| CI #106 | `f5fd5b2` | FAILURE | `Record<string, unknown>` not assignable to `JSONValue` | Current unresolved TypeScript boundary |

The history demonstrates why a single latest red run is insufficient: there were earlier green milestones, later regressions, and large clusters of repeated manifestations.

## 4. Recurring Failure Clusters

### Cluster A — Lockfile/bootstrap

The initial repository had no stable canonical lockfile path for CI. Multiple temporary workflows attempted to bootstrap or refresh it. Failures around missing lockfiles, cache ordering, runner Node, and workspace installation are one CI bootstrap family rather than independent application bugs.

The final state is materially better: the repository has a root `pnpm-lock.yaml`, pnpm 10.15.1 is explicit, and current CI uses `pnpm install --frozen-lockfile`.

### Cluster B — Workspace/config consumption

Shared config introduction caused several web/CI failures because the package was not immediately consumable in its source/declaration/build state. The correct fix was not repeated TypeScript suppression; it was making the package buildable and building it before web validation.

### Cluster C — Phase 1 PostgreSQL validation

Several consecutive failures came from a common testing-model problem: PostgreSQL aborts a transaction after a constraint error. Savepoints, then independent transactions, were used to make negative constraint tests honest. Unexpected DB errors were subsequently changed from tolerated outcomes to hard failures.

### Cluster D — Phase 2A viem/indexer boundary

The decoder went through several iterations because viem's generic ABI inference did not line up cleanly with the repository's discriminated domain type. This produced parser typing, metadata-shape, exhaustive-branch, and DB test typing failures. These are related boundary issues, not independent product features.

### Cluster E — Phase 2A exact integers + JSONB

The current dense failure cluster is primarily one representation problem expressed in several locations: blockchain `uint256` values are `bigint`, PostgreSQL numeric/bigint values are string-oriented, and JSONB accepts a narrower JSON value type. Fixes that merely cast the TypeScript type can mask the boundary rather than establish a durable representation contract.

### Cluster F — Payroll completion semantics

The current contract's `executePayroll` loops over the supplied employee IDs and emits one `PayrollPayment` per employee, then emits a `PayrollRunCompleted` event for that execution call. Because the contract allows another call with the same run ID for other employees, the same `(companyId, runId)` can legitimately have more than one completion event. A projection that overwrites `total_paid` and `employee_count` on each completion can therefore undercount the run and lose prior completion observations.

## 5. Regressions

### Confirmed regression-like patterns

1. **Phase 2A did not stabilize after the first successful Phase 1 milestone.** CI #75 was green, then the Phase 2A decoder/persistence sequence reintroduced failures.
2. **JSONB handling has been corrected multiple times but remains unresolved at the TypeScript boundary.** The current CI #106 failure proves that the serialization fix was not yet sufficient.
3. **Exact bigint handling moved from schema/runtime assumptions into test parameter work.** This is improvement, but it shows the original root cause was broader than one failing query.

### No evidence of a contract regression

The current Solidity source and current contract suite are consistent, and recent contract CI jobs have been green. No historical failure reviewed here establishes a current double-payment vulnerability in the Solidity implementation.

## 6. Current Open Errors

### OPEN-01 — Phase 2A TypeScript JSON value boundary

Current CI #106 fails before API build/tests with:

`src/indexer/persist.ts(42,78): error TS2345: Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'JSONValue'.`

A second identical class of error occurs at line 59. This is a real type-contract failure in the current implementation, not a CI false positive.

### OPEN-02 — Phase 2A has not received a post-fix green full-CI validation

The latest corrective commit `f5fd5b2` has a failed CI run during the audit window. Until a clean run completes, Phase 2A cannot be declared complete.

### OPEN-03 — Phase 1 schema uses signed BIGINT for contract-derived employee/run identifiers

The contract emits `employeeId` and `runId` as `uint256`, while the underlying counters are `uint64`. PostgreSQL signed `BIGINT` tops out at `2^63-1`, while `uint64` can reach `2^64-1`. Therefore `employees.employee_id`, `payroll_runs.run_id`, `payroll_runs.employee_count`, and the corresponding payment foreign-key columns are narrower than the contract's declared numeric domain. This is currently latent because realistic counts are far smaller, but it is a source-of-truth mismatch and should be corrected with a forward migration before production indexing.

### OPEN-04 — PayrollRunCompleted projection can lose valid completion history

The contract permits multiple `executePayroll(companyId, runId, ids)` calls for the same run when they contain different employees. Each call emits a `PayrollRunCompleted` event. The current projection overwrites `payroll_runs.total_paid_base_units` and `employee_count` instead of accumulating the per-execution observations. This is a concrete financial-reporting correctness bug in the projection layer, even though Monad remains the financial authority.

## 7. Latent Risks

### L-01 — Mutable projections lack explicit last-observed chain position

`EmployeeStatusChanged` updates `employees.active` without storing the source event's block/log position. A future concurrent/out-of-order indexer could apply an older status after a newer status. The current ordered batch processing reduces this risk but does not create a database-level monotonicity guarantee.

### L-02 — Replay currently trusts the atomicity invariant

A replayed event returns `replayed` after verifying the existing indexed-event payload, but does not repair a missing domain projection. That is safe if every historical write went through the current atomic persistence path. It is not a self-healing migration mechanism for legacy partial rows.

### L-03 — Transaction metadata consistency is not fully verified on conflict

`blockchain_transactions` uses `(chain_id, transaction_hash)` as its key and `ON CONFLICT DO NOTHING`. The persistence layer does not currently verify that a conflicting transaction row has the same block number/hash/transaction index. A future reorg/reconciliation implementation needs an explicit consistency policy.

### L-04 — ABI definitions are duplicated across layers

The current indexer defines its event ABI locally, while the web app has another hand-maintained ABI. The signatures currently match the Solidity source for the functions/events used, but duplicated ABI definitions create future drift risk.

### L-05 — Frontend payroll run ID is predicted from current state

The dashboard derives `expectedRunId = company.nextRunId` before submitting `createPayrollRun`. With multiple browser sessions/operators using the same company owner, this prediction can become stale. A production-grade flow should derive the actual run ID from the confirmed transaction/event rather than trusting a pre-submit read.

### L-06 — Frontend has no deployment address yet

The dashboard intentionally disables financial actions when no verified contract address is configured. This is safe, but it means the product has not yet demonstrated a live end-to-end production deployment.

## 8. Infrastructure Issues

### Render

Current PayChad service:

- Service: `PayChad API Production`
- ID: `srv-dacl3ngjo6nc738jci0g`
- Branch: `main`
- Region: Ohio
- Auto deploy: enabled
- Build: `pnpm install --frozen-lockfile && pnpm --filter @paychad/api build`
- Start: `pnpm --filter @paychad/api start`
- URL: `https://paychad-api-production.onrender.com`
- Health check path: currently blank

The latest Render deployment for commit `f5fd5b2` failed during build, matching the current TypeScript failure. No Render mutation was performed during this audit.

A dedicated PayChad PostgreSQL database does **not** exist. The existing unrelated `nagode-db` was not reused or modified.

Render provisioning history also showed PostgreSQL creation attempts failing at the platform level while the workspace's free database limit prevented a second free database. Those are infrastructure/provisioning issues, not application schema failures.

### Vercel

The connected Vercel team was inspected. There is currently no PayChad Vercel project linked to `juicyblxst-lang/paychad`. Existing Vercel projects are for unrelated repositories. No Vercel resource was modified.

## 9. Security / Financial Risks

### Solidity

Current contract behavior has several positive properties: owner checks, non-reentrancy around token movement, explicit duplicate-payment protection through `lastPaidRun`, exact `uint256` amounts, and event emission for funding/payment/withdrawal. Recent contract CI is green.

The important projection-level finding is that `PayrollRunCompleted` is **not a unique final-run event** under the current contract. It is emitted after each execution call. Any off-chain consumer must therefore treat it as an execution summary and aggregate multiple observations for the same run. Monad remains the financial authority.

### Database/indexer

The highest financial correctness risk is not the database creating money; it is the indexer producing an incorrect projection that operators might mistake for chain truth. The current architecture correctly avoids an off-chain payroll balance ledger.

The event identity constraint prevents the same blockchain log from being inserted twice. Payroll payment identity also prevents duplicate `(company, run, employee)` payment rows.

However, mutable projection ordering and future concurrent indexing require stronger event-position handling before production indexing is enabled.

### Frontend

The frontend uses viem `bigint` for on-chain amounts and `parseUnits` for USDC values, which is the correct general representation. The run-ID prediction race described above is the main latent correctness concern.

## 10. Fix Quality Assessment

### Genuine root-cause fixes

- Canonical root lockfile + frozen pnpm installation.
- Shared config declaration/build ordering.
- API production entrypoint.
- Contract tuple/named-field handling.
- Exact PostgreSQL company ID representation.
- Transaction-aware schema validation.
- Event payload retention in JSONB.
- Explicit transaction-before-event FK ordering.
- Atomic event persistence boundary.

### Symptom-level or incomplete fixes

- Repeated TypeScript casts around viem/Postgres generic types. These reduce compiler friction but do not by themselves define a stable representation boundary.
- Repeated JSONB serialization adjustments without a single explicit JSON-domain type.
- Test-only bigint parameter changes without correcting the underlying signed-BIGINT schema mismatch.

### Insufficiently validated fixes

- Phase 2A replay/concurrency behavior has not yet been followed by a clean full-CI run after the final typing changes.
- Out-of-order recovery is explicitly fail-closed, but the future worker's retry/replay strategy is not yet implemented.
- Payroll completion aggregation has not yet been corrected or regression-tested.

## 11. Recommended Fix Order

### P0 — Financial/security/data correctness

1. Treat `PayrollRunCompleted` as a per-execution event and aggregate its totals/counts exactly once per event identity.
2. Establish one exact integer representation contract across Solidity → viem → domain → PostgreSQL.
3. Correct the employee/run/count schema width mismatch with a forward migration before production indexing.
4. Add event-position metadata/monotonicity rules for mutable projections before concurrent production indexing.

### P1 — Core product correctness

5. Finish the Phase 2A JSON-domain typing boundary without unsafe casts.
6. Complete and green all Phase 2A decoder/persistence/replay/rollback/out-of-order tests.
7. Remove ABI drift risk by establishing a single authoritative ABI source for web/indexer consumers.
8. Make frontend payroll-run identification event-derived rather than precomputed.

### P2 — CI/deployment reliability

9. Obtain a clean full CI run after Phase 2A fixes.
10. Add explicit Render health-check configuration only when the service is otherwise validated; do not mutate Render during this audit.
11. Provision a dedicated PayChad Postgres only after choosing a valid Render plan and explicit infrastructure approval.

### P3 — Developer experience / quality

12. Add richer domain-level test fixtures and clearer failure diagnostics.
13. Add a machine-readable audit/census process to CI history tooling if long-lived development continues.

## 12. Areas Not Yet Properly Validated

- Live Monad RPC → event ingestion: **NOT VALIDATED**; no live worker exists.
- Production PostgreSQL connectivity: **NOT VALIDATED**; no dedicated PayChad DB exists.
- Production indexer restart/reorg behavior: **NOT VALIDATED**.
- Production frontend contract deployment: **NOT VALIDATED**; no verified PayChad contract address is configured.
- Vercel PayChad deployment: **NOT VALIDATED**; no PayChad Vercel project exists.
- Render HTTP health-check behavior: **NOT PROPERLY VALIDATED**; the service has `/health`, but its Render health-check path is blank.
- Concurrent multi-process indexing: **NOT VALIDATED**.
- Database/chain reconciliation after reorg: **NOT VALIDATED**.

## 13. Audit Limitations

GitHub's Actions API exposed the complete aggregate run counts and individual run metadata, and job logs were inspected at representative failure transitions. The connector's workflow-run collection returns oversized JSON in a truncated response, so it does not expose all 119 runs' complete individual step logs in one retrievable payload. Consequently, this report treats the **86/33 run counts as exact**, but does not pretend that every historical log line was individually re-read when the API response was truncated.

The root-cause grouping is therefore evidence-based and conservative: repeated failures with the same subsystem/commit-fix sequence are grouped, while uncertain historical manifestations are not fabricated into more precise counts.

## 14. Current Verdict

**PayChad is not yet healthy enough to declare Phase 2A complete.**

The repository has a substantially healthier foundation than the raw failure count suggests, and Phase 1 reached a verified green milestone. The current Phase 2A failures are concentrated, but there is also a concrete projection semantic bug around repeated `PayrollRunCompleted` events and a latent schema width mismatch.

The correct next move is to fix the projection semantics and exact integer/JSON representation contracts, add regression coverage, then run a clean full CI and re-audit the resulting history. No Render or production database mutation is part of this remediation step.
