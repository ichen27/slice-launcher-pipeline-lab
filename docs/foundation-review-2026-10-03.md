# Foundation review — 2026-10-03

Reviewed the complete foundation at `47e494a`, including application code, shared packages, tests, build configuration, public data boundaries, and GitHub CI/CD.

## Repairs

- Register shared UI source files with Tailwind; the original build omitted tile-only utilities.
- Remove the global unlayered anchor color rule, which overrode white button text.
- Require all apps to declare lint, typecheck, test, and build scripts and run app-specific lint commands.
- Align supported Node versions with the installed tools: Node 22.13+ within 22.x or Node 24.x.
- Probe the built Worker before merge, including the page and its CSS/JavaScript assets. A health route alone cannot detect a broken page or missing assets.
- Serialize production deployments and skip commits superseded by `main`; add deployment configuration checks and bounded job timeouts.
- Override satori’s pinned `fflate` dependency with compatible patched version 0.7.5 for [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).

## Open dependency advisory

`pnpm audit` reports [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) for `braces@3.0.3`. No patched npm version was published when reviewed. The dependency arrives through vinext’s build tooling: vite-plugin-commonjs → vite-plugin-dynamic-import → fast-glob → micromatch → braces. The advisory concerns stack exhaustion from deeply nested glob patterns.

The current launcher accepts no user-provided glob patterns, and the built Worker’s source maps contain no braces, micromatch, or fast-glob sources. This is evidence of build-time exposure in this application, not proof that the dependency is safe for every future use. The finding is not suppressed. Run `pnpm audit` during dependency changes and revisit the upstream advisory before adding dynamic glob handling.

## Remaining foundation work

- Configure the Cloudflare API token in GitHub’s `production` environment, enable deployment, and verify a complete automatic release. The account ID and public URL can be configured independently.
- Design and implement in-app authentication and server-side authorization before introducing private content. Public routing does not implement login.
- The catalog remains empty and the alumni database is not implemented. These are separate application work, not existing functionality.
