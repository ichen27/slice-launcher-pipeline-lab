# Coding and architecture standards

## Boundaries

Apps deploy independently. An app may import shared packages through their published exports and its own dependencies. Apps cannot depend on another app or import its internal files. Shared packages cannot import apps. `scripts/check-architecture.mjs` parses TypeScript/JavaScript imports and re-exports, resolves aliases, checks workspace dependencies, and walks client import graphs. It rejects client paths reaching server-only modules, Cloudflare/Node server bindings, environment access, and nonliteral dynamic imports. Type-only contracts are allowed. Keep server modules marked with `server-only`; membership auth/API/repository are also recognized explicitly. This check supplements review and bundler isolation; it cannot prove arbitrary runtime code safe.

Common components and design tokens belong in `packages/ui`. Preserve Slice's approved logo, typography, colors, and accessible form conventions. App-specific libraries belong in that app's manifest. Avoid copy-pasting a design system into new apps.

## Server and data contracts

Validate external input at the boundary with explicit schemas and bounded payloads. Verify issuer, audience, signature, expiry, and human identity before resolving membership. Use the current database membership state on every protected request. A valid Syracuse identity alone is insufficient authorization. Never trust permissions from a client or stale session. Enforce same-origin writes and return private/no-store member responses. Parameterize database queries and atomically persist changes with audit history.

## Maintainability

Keep TypeScript strict; do not hide errors with blanket lint disables, any, unchecked casts, or catch-and-ignore. Explain unusual assumptions near the code. Keep modules focused by behavior. Tests should prove user-visible behavior or a security/reliability invariant, including rejection paths. A named test script is a minimum contract, not useful coverage by itself.

Every app must declare lint/typecheck/test/build commands and include a README describing configuration, permissions, deployment, and testing. CI checks the script and README contract; reviewers judge whether the descriptions and tests are meaningful. Add shared checks to the reusable validation workflow to keep PR and release validation aligned.
