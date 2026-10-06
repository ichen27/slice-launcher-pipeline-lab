# Slice Launcher Foundation Design

> **2026-10-02 update:** Ivan chose a public launcher URL with authentication inside the app. Cloudflare Access steps below record the original plan and are superseded by [deployment.md](../../deployment.md). The current empty launcher has no sign-in or private data.

**Status:** Approved by Ivan on 2026-10-02

## Purpose

Create the public foundation for Slice Consulting software. A launcher gives consultants one entry point to separately deployed applications. The repository makes it straightforward for future consultants to add an app while sharing code standards, UI components, and CI/CD tooling. The alumni application is the first planned consumer, not part of this initial foundation build.

## Repository and ownership

- Repository name: `slice-launcher`, initially under Ivan's GitHub account and transferable to a Slice organization later.
- Local development checkout: `/Volumes/SamsungSSD1/code/slice-launcher` on the Mac mini.
- Public source with the MIT license. The `LICENSE` copyright holder must be confirmed before publication; the project manager agreement inspected so far does not identify one.
- The older private `ichen27/slice-platform` repository and the older unreviewed Slice directories on the SSD remain separate.

## Structure

```text
apps/
  launcher/       Next.js application deployed to its own Cloudflare Worker
packages/
  ui/             Reusable presentation components
  config/         Shared TypeScript, lint, and formatting settings
docs/             Adding an app, deployment, and data-handling guides
```

Use a pnpm workspace with per-app `package.json` files. Each future application lives under `apps/`, owns its runtime dependencies and deployment configuration, and can import approved shared packages. The launcher lists app entries and links to their separate deployments. It does not route requests for every app through a single deployment. Add a new app only when its requirements are known; this foundation includes an app integration guide rather than an empty example deployment.

## Runtime and data boundary

Use TypeScript and Next.js for the launcher, targeting Cloudflare Workers through vinext, subject to a successful build and smoke test. Cloudflare Access protects the internal launcher. Public source visibility does not grant access to the deployed app.

The foundation contains no production alumni records, confidential documents, deployment credentials, or local environment files. Future apps use service bindings or server-side secrets and enforce authorization before returning data. Real alumni data is imported into a protected database outside Git. Public test fixtures use invented records only.

## Contribution and release flow

Pull requests run GitHub Actions jobs for formatting, lint, type checking, meaningful tests, and a production build. A `main` branch rule requires pull requests and the relevant checks; direct pushes and force pushes are blocked, including for administrators where supported. Ivan reviews contributions from others. His own pull requests need no other approval while he is the sole maintainer. If write access is granted to others, the review gate must be revisited so they cannot merge without his review. Deployment runs only after an approved merge to `main`, with a narrowly scoped Cloudflare token stored as a GitHub secret. The deployment job builds, deploys the launcher, and checks that its health endpoint responds. Untrusted pull-request jobs receive no deployment secret.

## Acceptance

1. A new contributor can clone the repository, install dependencies, and run the launcher locally using documented commands.
2. CI fails on a deliberate lint, type, test, or build failure and blocks merging.
3. A reviewed change that passes CI deploys the launcher to Cloudflare, and a deployment smoke check confirms availability.
4. The public repository and CI logs contain no real alumni records or credentials.
5. The deployed launcher requires an authorized Slice sign-in.

## External setup needed

Confirm the MIT copyright holder and the Slice account or organization that will own the production Cloudflare Worker, Access policy, domain, and deployment token. Those values are configured outside the repository.
