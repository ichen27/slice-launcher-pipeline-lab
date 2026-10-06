# Contributing

Use the Node/pnpm versions in package.json and install with `pnpm install --frozen-lockfile`.
Keep changes focused. See [architecture standards](docs/architecture.md), [security review](docs/security-review.md), [adding an app](docs/adding-an-app.md), and [release operations](docs/deployment.md).

Before requesting review run formatting, lint, typecheck, tests, coverage, migration tests, browser tests, build, and Worker smoke as listed in the shared validation workflow. Browser tests use disposable synthetic identities and data; never use production credentials or members in tests.

Open a PR. Explain the behavior, meaningful tests, and migration/deployment effects. Include desktop/mobile screenshots for visible changes. Ivan reviews other contributors' PRs; his own need no independent approval. Required checks and resolved conversations apply to everyone. Currently Ivan is the sole write maintainer. Zero required approvals do not mechanically enforce the identity of a reviewer: adding maintainers requires revisiting merge policy. AI findings are advisory and may be wrong or incomplete.

Do not commit customer data, real member exports, tokens, or `.env` files. Report vulnerabilities through GitHub's private vulnerability reporting when available; otherwise contact the maintainer privately before publishing exploit details.
