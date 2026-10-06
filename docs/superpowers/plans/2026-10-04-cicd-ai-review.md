# CI/CD and advisory AI review implementation plan

**Goal:** Implement the user's attached CI/CD brief through a verified draft PR. No merge, production deployment, access change, or production migration in this task.

**Baseline:** main 178f527; 37 tests; required validate; zero approvals; strict status checks and conversation resolution. PR #10 fixed initial membership route propagation. Secret scanning and push protection already enabled. No open PRs or dirty work on inspection.

**Architecture:** Secret-free reusable validation, immutable release artifacts promoted by a production-only job, and a separate trusted-base AI reviewer. GPT receives original bounded source/context; Jev only adds optional focused judgments. Both advisory. Synthetic browser identities exist solely in a disposable local test harness.

## Global constraints

- Develop over ssh mini on SSD; preserve approved UI.
- Never run contributor code with model or production secrets; never use pull_request_target to execute contributor code.
- Stable required check named validate; skipped/failed dependencies fail the aggregate. No new independent approval requirement.
- No production migration or rollback execution; implement and test recovery mechanics locally.
- AI provider availability and credits cannot be inferred. Missing credentials must explicitly report unavailable. No keys in chat.
- User brief authorizes implementation after a concise plan; no extra design approval checkpoint is needed. Final approval is reserved for merge/production actions.

## Tasks

- [x] Standards and tests: inspect existing authorization tests; enforce app/package boundaries with parsed imports; document app configuration contracts and standards; add signed synthetic browser tests with isolated SQLite/D1; test migration history, measure critical-module coverage, add focused accessibility checks.
- [x] Release and required validation: shared checks, fail-closed validate aggregation, pinned Actions, CodeQL/dependency review/Dependabot, build once artifact with digest/source identity, same artifact deployment, version smoke and Access denial, explicit verified-version rollback with migration policy.
- [x] Advisory review: trusted protected-base collection via GitHub read API, exact base/head, bounded complete context and explicit incomplete result, GPT strict structured output, optional TypeSafe official API judgments, safe idempotent publication, stale detection, mock-provider security tests and independent A/B evaluation fixtures.
- [ ] Integration: run checks, inspect trust boundaries and generated artifacts, test representative required-gate failures, open draft PR, inspect Actions and protection, document settings/costs and untested paths, record verified state in Obsidian.

## Review focus

Check fork PR secrets, stale head races, oversized/binary/dropped context, denial mistaken for rollout propagation, artifact/path substitution, client transitive server imports, and migration rollback assumptions.

## Execution and ownership

Use disjoint parallel work areas (tests/standards, release workflow, AI review), then an independent whole-branch review. Parent coordinates shared package/lock changes and final integration. Deliver logical commits, tests, and evidence. No remote production actions.

## Verification checkpoint

Implementation completed on isolated SSD branch `feat/cicd-ai-review`. Local formatting, lint, types, 46 tooling tests, 37 application tests, measured critical coverage, two browser scenarios, migration checks, production build, expected-SHA Worker smoke and artifact integrity checks passed. Thirteen advisory AI tests and fourteen mock A/B arm runs passed; live provider quality/cost was not measured. Independent review findings were repaired and rechecked: rollback download isolation, required standards loading, base/head staleness, renamed-file completeness, and erased named type imports.

Draft PR #11: https://github.com/ichen27/slice-launcher/pull/11 . Deliberately omitted the required Testing section in a diagnostic commit; Actions run 37232168745 failed the quality job and the required `validate` while every security job passed. This proves a failing prerequisite cannot turn into a green aggregate. The diagnostic change is restored in this commit. Main protection was re-read: strict required validate (GitHub Actions app15368), zero approvals, conversation resolution, admin enforcement, force/deletion disabled. Final restored-head Actions result is recorded in the PR and Obsidian once complete.

No merge, production deployment/access changes, production migrations, or live rollback performed. Existing Dependabot alerts/security updates enabled; unpatched transitive braces advisory documented. Provider activation, real A/B quality evaluation, first verified production release and an operator-approved live rollback exercise remain follow-up activation work requiring credentials/approval. The AI workflow deliberately executes protected-base code, so its first unmerged PR cannot bootstrap privileged execution.
