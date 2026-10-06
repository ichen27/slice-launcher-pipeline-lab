# Slice Launcher Foundation Implementation Plan

> **2026-10-02 update:** Ivan chose a public launcher URL with authentication inside the app. Cloudflare Access steps below record the original plan and are superseded by [deployment.md](../../deployment.md). The current empty launcher has no sign-in or private data.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and deploy the public `slice-launcher` monorepo with an internal Cloudflare-hosted launcher and enforced GitHub pull-request checks.

**Architecture:** A pnpm workspace contains one Next.js launcher app and shared UI/config packages. The launcher runs as its own Cloudflare Worker through vinext; future apps get separate deployments and appear through typed launcher entries. GitHub Actions checks pull requests and deploys only validated `main` commits.

**Tech Stack:** Node.js 22, pnpm, TypeScript, Next.js, vinext, Cloudflare Workers and Access, GitHub Actions.

**Spec:** [Slice Launcher Foundation Design](../specs/2026-10-02-slice-launcher-design.md)

## Global Constraints

- Work on the Mac mini at `/Volumes/SamsungSSD1/code/slice-launcher`. Read the SSD `README.md`, `storage-map.json`, `AGENTS.md`, and `project-registry.json` before editing; register the new project after creation.
- The repository is public under `ichen27` initially. Do not reuse the unrelated `slice-platform` repository or either unreviewed Slice checkout.
- MIT is the intended license; confirm the actual copyright holder before creating `LICENSE` or publishing the GitHub repository.
- Production alumni records, confidential documents, deployment credentials, and local environment files never enter Git or public CI logs.
- Each app has its own runtime dependencies and Cloudflare deployment. The initial build includes only the launcher; the alumni app is a later project.
- Protect the deployed internal launcher with Cloudflare Access. Define allowed identities with Slice before declaring it ready for use.
- Pin generated dependencies in `pnpm-lock.yaml`. Use named, unique CI job IDs for branch requirements. Keep `.env.example` trackable while excluding real `.env*` and `.dev.vars*` files.

## File map

| Path                                                                   | Responsibility                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`                | Workspace scripts and deterministic installation                         |
| `apps/launcher/`                                                       | Next.js UI, app manifest, `/api/health`, Worker deployment configuration |
| `packages/ui/`                                                         | Reusable app tile component imported by the launcher                     |
| `packages/config/`                                                     | Shared TypeScript, ESLint, and formatting configuration                  |
| `.github/workflows/ci.yml`                                             | Pull-request validation without deployment secrets                       |
| `.github/workflows/deploy-launcher.yml`                                | Checked `main` deployment and authenticated smoke check                  |
| `docs/adding-an-app.md`, `docs/deployment.md`, `docs/data-boundary.md` | Contributor and operator instructions                                    |
| `LICENSE`, `.gitignore`, `README.md`                                   | Licensing, exclusions, and setup guide                                   |

## Review Focus

- A manifest entry with no deployment URL must render as unavailable, never as a broken link (Task 2 test).
- An unknown or malformed app URL must not become a clickable launcher link (Task 2 test).
- A public PR must have no access to Cloudflare deploy credentials (Task 3 workflow check).
- A failed build on `main` must prevent deployment (Task 4 workflow check).
- A protected deployment must reject an unauthenticated request and accept the configured smoke-check service token (Task 6 probe).

---

### Task 1: Create the local workspace and launcher scaffold

**Files:** Create `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `README.md`, `apps/launcher/**`; update the SSD `project-registry.json` only after the checkout is established.

**Interfaces:** Root scripts `dev`, `format:check`, `lint`, `typecheck`, `test`, `build`; app scripts `dev`, `build`, `deploy`; Worker named `slice-launcher`.

- [ ] **Step 1: Confirm location.** Verify the SSD is mounted, `/Volumes/SamsungSSD1/code/slice-launcher` does not exist, and `ichen27/slice-launcher` does not already exist. Record the directory and Git state before changes.
- [ ] **Step 2: Scaffold.** Use Cloudflare's current Next.js C3 flow with `--framework=next`, `--no-deploy`, and `--no-git` under `apps/launcher`; inspect the generated vinext and Wrangler configuration before altering it.
- [ ] **Step 3: Add workspace files.** Use pnpm workspaces for `apps/*` and `packages/*`; replace the scaffold's npm lockfile with `pnpm-lock.yaml`; wire root scripts to the app and packages. Ignore real `.env*`, `.dev.vars*`, build output, dependencies, and user-specific files while allowing example files.
- [ ] **Step 4: Verify.** Run frozen installation, launcher build, and local dev server. A request to the local root must return the starter UI. Commit only files shown by a reviewed `git status` and secret/data scan.

### Task 2: Add the launcher shell and shared packages

**Files:** Create `packages/ui/src/app-tile.tsx`, `packages/ui/package.json`, `packages/config/**`, `apps/launcher/src/lib/apps.ts`, `apps/launcher/src/app/api/health/route.ts`, and focused tests; modify the launcher page and root scripts.

**Interfaces:** `AppEntry` has `id`, `name`, `description`, and optional `url`; `getPublicAppUrl(entry: AppEntry): string | null` returns a validated HTTPS URL or `null`. `AppTile({ name, description, href }: { name: string; description: string; href: string | null })` renders a link only for a non-null `href`. `/api/health` returns JSON `{ "status": "ok" }` without user or environment data.

- [ ] **Step 1: Test the app entry boundary.** Assert that an HTTPS entry renders a link, while missing, `javascript:`, `data:`, HTTP, and malformed URLs render unavailable text.
- [ ] **Step 2: Implement manifest and tile.** Keep the starter manifest empty or use only invented examples; show a useful empty state when no apps are registered. Import the shared tile from `@slice/ui` so the package boundary is exercised.
- [ ] **Step 3: Add config and route.** Enable strict TypeScript, shared ESLint/format settings, and the health route. Keep route output constant and public-safe.
- [ ] **Step 4: Verify.** Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; run the launcher locally and request `/api/health`.

### Task 3: Add contributor documentation and PR CI

**Files:** Create `.github/workflows/ci.yml`, `docs/adding-an-app.md`, `docs/data-boundary.md`; update `README.md`.

**Interfaces:** One stable required CI job ID, `validate`, runs on pull requests and pushes to `main`, validating the whole workspace. It receives no Cloudflare secrets and has read-only GitHub permissions.

- [ ] **Step 1: Document contributor path.** Give exact install, dev, test, build, and app registration commands. Explain independent app deployments and what may not be committed.
- [ ] **Step 2: Add CI.** On `pull_request` and pushes to `main`, use a GitHub-hosted runner, Node 22, a pinned pnpm version, frozen install, then format, lint, typecheck, tests, and build. Keep deployment permissions and secrets out of this workflow.
- [ ] **Step 3: Verify.** Run the same commands locally. Inspect the workflow to confirm no deploy step or secret reference; use a workflow parser or GitHub validation run after publishing.

### Task 4: Add post-merge deployment workflow

**Files:** Create `.github/workflows/deploy-launcher.yml`, `docs/deployment.md`; adjust app deployment script only to match the verified C3 output.

**Interfaces:** On push to `main`, job `validate-main` repeats the checks and gates job `deploy-launcher`. The deploy job also requires repository variable `SLICE_LAUNCHER_DEPLOY_ENABLED=true`; until set, it is skipped. The job uses production environment secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` and checks `/api/health` after deployment.

- [ ] **Step 1: Add a testable validation gate.** `deploy-launcher` depends on `validate-main` and the explicit enable variable, so a failed validation or incomplete Cloudflare setup prevents deployment. Restrict secret-bearing steps to the deploy job and set minimal GitHub permissions.
- [ ] **Step 2: Add deployment and smoke check.** Build and deploy the launcher with the scaffold's verified vinext command. Use Cloudflare Access service-token headers to request the configured production health URL; require HTTP 200 and `{ "status": "ok" }`.
- [ ] **Step 3: Document production setup.** Record required Cloudflare token scope, Worker/account selection, Access policy, service token, GitHub environment secrets, deployment URL, and rollback steps without recording secret values.
- [ ] **Step 4: Verify.** Check workflow syntax and inspect the job graph to confirm `deploy-launcher` requires successful `validate-main` plus the enable variable; confirm the initial `main` run skips deployment while setup is incomplete.

### Task 5: Publish and enforce the repository gate

**Files:** Create `LICENSE` after copyright-holder confirmation; finalize `README.md`, CI workflow, and deployment configuration.

**Interfaces:** Public `https://github.com/ichen27/slice-launcher`, required `validate` PR check, owner review for others’ contributions, no approval requirement on owner-authored pull requests, no bypass or force push to `main`.

- [ ] **Step 1: Clear publication gates.** Confirm the MIT copyright holder and inspect the full Git history, staged files, and workflows for confidential data. Create `LICENSE` from the canonical MIT text with the confirmed holder.
- [ ] **Step 2: Create and push.** Create the public GitHub repository from the SSD checkout, push the initial commit, and verify repository visibility and file contents via GitHub. Leave the older `slice-platform` repo untouched.
- [ ] **Step 3: Protect `main`.** After the first green CI run, require pull requests and the unique `validate` status check; leave the native approval count at zero while Ivan is the sole maintainer, no force pushes or deletions, and no admin bypass. Read back GitHub's applied settings.
- [ ] **Step 4: Exercise the gate.** Open a temporary PR with a deliberate failing check and confirm GitHub blocks merge. Close it without merging. Verify the effective branch rule through GitHub's API.
- [ ] **Step 5: Save repository context.** Register the confirmed SSD checkout in `project-registry.json` and update the Obsidian Slice project note with the public repository, owner, branch, and verified gate status.

### Task 6: Protect and deploy the launcher

**Files:** Complete the Cloudflare and GitHub production configuration described in `docs/deployment.md`; update the Obsidian Slice project note with verified deployment details.

**Interfaces:** A Cloudflare Access-protected launcher URL; production environment secrets named in Task 4; `SLICE_LAUNCHER_DEPLOY_ENABLED=true` after setup.

- [ ] **Step 1: Confirm production account and identities.** Select the approved Slice Cloudflare account, initial domain or Workers URL, and specific identities allowed into the launcher.
- [ ] **Step 2: Establish the Worker and Access.** Deploy the public-safe empty launcher shell once to create the Worker. Immediately protect it with Access for the confirmed identities. Verify an unauthenticated request is denied or redirected and an authorized request succeeds.
- [ ] **Step 3: Configure CD credentials.** Create narrowly scoped deploy and Access service tokens, store values in GitHub production environment secrets, and set `SLICE_LAUNCHER_DEPLOY_ENABLED=true`.
- [ ] **Step 4: Verify automatic release.** Merge a passing PR under the owner review policy. Confirm CI and deploy jobs pass, the protected `/api/health` smoke check returns HTTP 200 and `{ "status": "ok" }`, and the live app serves the merged commit.
- [ ] **Step 5: Save deployment context.** Record the live URL, commit SHA, CI run, deployment ID, account ownership, Access policy, and any remaining limitations in the Obsidian Slice project note without storing secret values.
