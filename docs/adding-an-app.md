# Adding an app

New apps live in `apps/<app-name>` and deploy independently. They may import `@slice/ui` and `@slice/config` or add their own dependencies. The launcher links to an app; it does not bundle the app into the launcher Worker.

1. Create `apps/<app-name>` with a unique package name such as `@slice/<app-name>`. Keep its deployment config in that folder.
2. Add its package scripts for `lint`, `typecheck`, `test`, and `build`. The root commands run these scripts across the workspace. `pnpm check:workspace` rejects apps that omit a required script; commands must perform real checks, not empty success placeholders.
3. Install dependencies from the root with `pnpm install`. Add app-specific packages with `pnpm --filter @slice/<app-name> add <package>`. For shared code, create a package under `packages/` and use `workspace:*`.
4. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm smoke:launcher` from the root.
5. If the app uses Tailwind and `@slice/ui`, add an explicit `@source` path to `packages/ui/src` in its stylesheet, relative to that stylesheet (see the launcher’s `app/globals.css`). Shared package classes must be included in each consuming app’s CSS build.
6. Add an entry to `apps/launcher/src/lib/apps.ts` with a stable ID, name, short description, and HTTPS production URL. Omit the URL until the app is ready; the tile will say “Coming soon.”
7. Open a pull request. Include the app’s independent deployment and rollback instructions. The `validate` check must pass. Ivan reviews contributions from others before he merges them; his own pull requests do not require another reviewer.

Do not commit live data, database exports, credentials, API tokens, `.env` files, or `.dev.vars` files. See [data boundaries](data-boundary.md).

## Membership permissions

Each catalog entry produces an `app.<id>.open` capability for access levels. Independently deployed apps must verify identity and check current membership on their server before serving private data. Hiding a launcher link is not an access control. See [membership](membership.md).
