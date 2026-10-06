# Testing membership and migrations

Run `pnpm test` for repository checks and all application unit/integration tests; `pnpm test:coverage` adds V8 measurement and critical-module gates. `pnpm test:migrations` runs the two migration scenarios independently. For browsers, install Chromium using `pnpm --filter @slice/launcher exec playwright install --with-deps chromium`, then run `pnpm test:e2e`.

## Disposable synthetic browser boundary

`apps/launcher/tests/e2e/server.ts` binds only `127.0.0.1:4173`, starts an in-memory Miniflare D1 database, applies the real migration files and configures a synthetic owner. No Wrangler production database binding or Cloudflare credentials are used. Production launcher/account components run in a separate Vite entry, and the harness invokes the real identity verifier, request handler, domain rules and repository. Every synthetic identity carries an RS256 signature checked by `verifyIdentity` against a per-run ephemeral key. There is no unsigned email/header bypass. The signing key lives in ignored `.e2e/`, is denied by the Vite file server, and is deleted on normal shutdown. A crash may leave an ignored key until the next run overwrites it; it is valid only for that local harness.

The harness is outside the application entry graph. Artifact validation rejects its `slice-e2e-only` marker. Never import this harness from a production entry or add test identity flags to production. These are synthetic application browser tests; they do not verify real Google sign-in, Cloudflare Access policy, deployed Worker routing or remote JWKS availability. Built Worker smoke checks are separate. The account shell is public-safe; protected directory/history views and every write remain governed by current server membership permissions.

The browser scenario covers onboarding, pending restrictions, direct forbidden writes/history, owner approval, profile editing and reload persistence, private directory fields, custom access levels, immediate revocation, suspension, disabled profile editing, and launcher/account navigation. Axe checks WCAG A/AA rules on onboarding, profile, member-access form, sign-in and launcher/navigation. A separate negative scenario rejects missing, tampered and service assertions. No UI design changes were required. Axe automation does not replace keyboard/screen-reader review.

There are no retries. Browser workers run serially against a new database each invocation, with distinct synthetic identities per scenario. Failures retain traces and screenshots under `apps/launcher/test-results/` and an HTML report under `apps/launcher/playwright-report/`. These can contain synthetic emails and short-lived synthetic JWTs; never run this harness with real identities, upload `.e2e/`, or add production secrets to the browser job. CI retains diagnostics for seven days. Review artifacts before sharing outside the repository.

## Fixture lifetime and measured coverage

D1 startup previously consumed the default five-second test timeout on a cold Miniflare start. Startup/migration now runs in `beforeAll` with a 30-second hook budget, reset runs before each test, and the runtime is disposed after the suite. Assertions retain Vitest's normal deadline; no retry hides a failed assertion. The database tests include persistence, duplicate enrollment, stale revisions and rollback when the final audit insert fails after earlier writes.

On the Mac mini with Node 22.23.3, the 37 application tests passed in 1.19 seconds and both Chromium scenarios passed in 5.6 seconds including server startup. These are local warm measurements, not a promised CI duration. Critical-module coverage measured before gates:

| Module     | Statements | Branches | Functions |  Lines | Gate floors (same order) |
| ---------- | ---------: | -------: | --------: | -----: | ------------------------ |
| auth       |     88.09% |   90.00% |      100% | 87.17% | 88 / 90 / 100 / 87       |
| api        |     94.87% |   86.20% |      100% | 93.75% | 94 / 86 / 100 / 93       |
| domain     |     99.23% |   94.61% |      100% | 99.05% | 99 / 94 / 100 / 99       |
| repository |     96.55% |   91.66% |      100% |   100% | 96 / 91 / 100 / 100      |

These floors preserve measured coverage for the specific authorization/persistence modules, rounded down to whole percentages. There is no arbitrary repository-wide percentage. The tests exercise rejection behavior and unchanged state, not implementation strings. Auth's uncovered path is remote JWKS retrieval/cache; the synthetic key resolver deliberately cannot validate live Cloudflare availability. Empty app catalog mapping is measured in contracts but not gated. Coverage does not prove all attacks or state combinations are handled. New sensitive behavior needs scenario review even when these floors pass; do not lower gates just to accommodate an uncovered branch.

## Migration checks

The empty database test applies every lexically ordered migration using Wrangler's SQL splitter and D1 transactional batches, with a migration ledger. The prior-schema test starts from frozen `tests/fixtures/prior-membership.sql` (main `178f527`, migration 0001), inserts a representative verified member and audit through the repository, then applies outstanding migrations and checks the existing records survive. A repeat run must leave the ledger unchanged. Keep the fixture frozen when adding future migrations. Currently 0001 is the only migration, so the upgrade path proves skip/preservation behavior; it does not claim to have exercised a nonexistent schema upgrade. Add migration-specific data assertions for future schema changes. No production migration was run.
