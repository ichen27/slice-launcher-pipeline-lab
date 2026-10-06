# Slice Launcher

The public monorepo for Slice Consulting’s app launcher and future independently deployed apps. The launcher includes an application catalog and membership administration. Cloudflare Access verifies Google identities at the approved email domain; the app enforces current membership, access levels, and individual permissions using private D1 storage. New members await approval. See [membership administration](docs/membership.md).

## Workspace

- `apps/launcher`: Next.js launcher on Cloudflare Workers using vinext.
- `packages/ui`: shared app tiles and future UI components.
- `packages/config`: shared TypeScript, ESLint, and Prettier settings.
- `docs`: contributor, data, and deployment guidance.

An app can use workspace packages and its own dependencies. Each app keeps its own deployment configuration and can release independently. Add a launcher entry when its production URL is ready.

## Local development

Use Node.js 22.13 or newer within the 22.x line, or Node.js 24.x, and pnpm 10.17.1. CI uses Node.js 22. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by vinext. Run the full gate before opening a pull request:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:migrations
pnpm --filter @slice/launcher exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm smoke:launcher
```

Use `pnpm format` to apply the repository style. See [adding an app](docs/adding-an-app.md), [data boundaries](docs/data-boundary.md), and [deployment](docs/deployment.md).

## Changes

Open a pull request into `main`. The stable `validate` check requires shared quality validation and security scanning. It covers app contracts, import boundaries, formatting, lint, types, behavioral tests, critical-module coverage, migration and browser tests, the production build, CodeQL, dependency review, and local Worker smoke. See [contributing](CONTRIBUTING.md) and [security review](docs/security-review.md). Ivan reviews contributions from others; his own pull requests need no other approval. Ivan is currently the sole maintainer with write access. Protected production deployment uses Wrangler and GitHub production secrets, including a Slice-only Access service credential for release checks.

Licensed under MIT; copyright Slice Consulting.

## Advisory model review

The proposed trusted-base GPT reviewer and optional TypeSafe Jev judgments supplement deterministic checks. They cannot approve, merge, deploy, or waive required checks. See [AI review](docs/ai-review.md) for activation, limits, costs and evaluation. Model API credits are separate from ChatGPT/Codex subscriptions. Never paste keys into chat or commit them.
