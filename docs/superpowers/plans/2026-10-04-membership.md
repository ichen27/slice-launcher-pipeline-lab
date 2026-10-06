# Membership implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline, task by task.

**Goal:** Authenticated profiles, custom access levels and member administration.

**Architecture:** Pure membership rules and revision-guarded D1 persistence behind verified Cloudflare Access identity; React screens consume authorized API responses.

**Tech stack:** Existing vinext/React, TypeScript, D1, jose, Vitest, Wrangler.

**Spec:** ../specs/2026-10-04-membership-design.md

## Global constraints

Mac mini SSD checkout; pnpm 10.17.1, Node 22. No identity bypass, implicit owner bootstrap, or private source data. Minimal applications-first UI. Production activation requires confirmed owner email and Access setup.

## Tasks

- [x] Domain tests then implementation: effective permissions, onboarding, invitation binding, profiles, role creation/assignment, overrides, suspension, delegation, ownership, audit.
- [x] SQL migration and D1 repository: consistent snapshots, revision guard, rollback/conflict tests on real SQLite, local D1 migration, generated types.
- [x] Identity/API: JWT verification, human identity only, bounded JSON, same-origin writes, no-store responses, privacy, conflict handling, denied-access tests.
- [x] UI: profile, pending status, members, member editor, access-level editor; loading/saving/errors; synthetic authenticated local browser flows.
- [ ] Release: full gate, fresh whole-branch review, production prerequisites, PR/CI, deploy and allowed/denied checks; Obsidian handoff.

## Review focus

Role edits affecting actor privileges; stale JWT after suspension; concurrent revocation/last-owner edits; pre-existing subject binding; private data in pending/directory responses.

## Ledger

- User approved the design and implementation. Proceed inline without requesting the same approval again.
- Owner email and sign-in account type requested; production configuration awaits the answer.

## Implementation record — 2026-10-04

- Domain and identity tests were observed failing before implementation, then passing. API integration tests were added after the API handler; they are integration coverage, not a claimed red/green cycle.
- Actual Miniflare D1 tests prove atomic persistence and rejection/rollback of stale writes. Local Wrangler migration applied successfully.
- Local gate passed: 27 application tests plus 5 repository tooling tests, TypeScript, ESLint, production build, and built-Worker smoke (page, health, five assets).
- Browser exercised signed synthetic owner and pending identities with real domain/API/D1 code behind the built UI: profile editing, custom Consultant level, pending enrollment, approval, restricted directory, and desktop/mobile layout. The local-only harness is ignored and not part of the Worker.
- Fresh whole-branch reviewer found no critical/important issues. A stray documentation marker was removed.
- Ruling: require explicit owner email configuration against an empty database before enabling sign-in. Existing-member ownership recovery remains a separate operator procedure; configuring in the wrong order requires that recovery.
- Resource created: empty private Cloudflare D1 database `slice-membership`. No remote migration or production identity configuration has been applied.
- Release is held at draft PR until confirmed owner email, sign-in provider, Access scope, and real allowed/denied validation are available. A whole-host Access gate also requires adapting the existing public CD smoke check.
