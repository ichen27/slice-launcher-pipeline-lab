# Membership administration

Cloudflare Access proves who signed in. The launcher's private D1 database determines what that person can do. This release supports one organization, Slice Consulting.

## Member workflow

- A person signs in with a verified email and selects **Continue** to create their profile. Unknown people are **Pending approval**, with access only to their own profile.
- An administrator selects **Organization → Members**, chooses the person, assigns an access level, and changes their status to **Active**.
- Alternatively, an administrator uses **Add member** with an email and access level. The person is **Invited** until they sign in with that exact email. Share the app URL yourself; this release does not send invitation emails.
- **Access levels** groups permissions under names your team chooses. Every member has one base level. Editing a level affects all members assigned to it.
- A member can also have individual **Allow** and **Revoke** permissions. Revoke wins over both base permissions and individual allows.
- **Suspended** members retain their profile record but receive no organization permissions. Server checks use current database state on every request; an old sign-in token does not restore access.
- Owners have all permissions. Only owners can grant ownership, change owners, or change their own access. At least one active owner must remain.
- Delegated administrators cannot grant permissions they do not hold or modify members whose effective access exceeds their own. They cannot edit their own base access level.
- **Activity** records membership and level changes. Only members with `audit.read` may see these records, which contain personal information.

## Production activation checklist

Production uses a Slice-specific Worker Access application, Google sign-in, and the exact `g.syr.edu` email domain. Other verified users of that domain start pending unless invited. The initial owner is configured privately in D1. The issuer and audience are pinned in Wrangler; missing configuration fails closed. Complete these steps for a new environment or account transfer.

1. Obtain the confirmed initial owner's email and the agreed identity provider. Never derive ownership from whoever visits first or from a developer's Cloudflare session.
2. Apply `0001_membership.sql` to the private `slice-membership` database using Wrangler and an operator account with D1 write permission. From the repository root: `pnpm --filter @slice/launcher exec wrangler d1 migrations apply slice-membership --remote`. Check the target account before confirming. The existing Worker-only CI token is not a database migration credential.
3. Before enabling sign-in, set the singleton organization's `owner_email` to the confirmed, normalized email using a private operator SQL file and `wrangler d1 execute`. Guard the update with `owner_claimed = 0` and an empty members table. Do not put real emails or this SQL file in Git. Verify exactly one organization row was updated. The matching first verified sign-in consumes this bootstrap once. If members already exist, stop and use a separately reviewed recovery procedure; changing the email alone does not promote an existing record.
4. Configure a Cloudflare Access self-hosted application for the production hostname, using the approved identity provider. Its identity policy must allow intended new people to authenticate before membership approval. Unknown authenticated people can create pending profiles, but cannot read the directory or admin data. Do not use a Bypass policy for the membership API. Do not mistake an Access login for Slice membership.
5. Set `ACCESS_TEAM_DOMAIN` to the full `https://<team>.cloudflareaccess.com` issuer and `ACCESS_AUD` to this application's audience tag in the deployment configuration. These identifiers are not credentials; tokens and client secrets must remain secret. Keep production and test identity configurations separate.
6. The current Access application protects all traffic to the Slice Worker, including its production and preview URLs. A dedicated `slice-launcher-ci` service token is attached only to this app with a Service Auth policy. Store its Client ID and Secret as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` in GitHub production secrets (expiration: October 4, 2027). The post-deploy smoke sends those headers to same-origin page, health, and asset requests, and asserts that the membership API rejects the service identity with 401. For a new environment, decide the protected hostname/path scope before enabling the Access application. Protecting the entire hostname changes the current unauthenticated CD smoke check: it will receive an Access redirect. Provide a narrowly scoped CI service-auth policy and secret headers for the public-shell smoke check, or deliberately preserve public shell/health paths and protect all membership API paths (including `/api/membership/login`). Never add a broad bypass solely to keep CI green. The membership API rejects service identities even if Access admits a CI service token to the shell.
7. Deploy through the normal pull-request gate. Check a real owner sign-in, a second pending person's sign-in, approval, restricted directory, per-user revocation, suspension with an existing session, and logout. Check direct API requests without valid JWTs are denied. Do not claim production activation from synthetic/local tests.

The D1 database ID and application code may be public. Member records, JWTs, secrets, and operator bootstrap data must remain private.

## Local verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm smoke:launcher`. Integration tests create disposable Miniflare D1 databases and synthetic signed identities. They exercise pending enrollment, invitations, approval, directory privacy, stale writes, audit rollback, suspension, wrong-audience tokens, forged tokens, service tokens, request size, and same-origin writes.

For local Wrangler storage, run `pnpm --filter @slice/launcher exec wrangler d1 migrations apply slice-membership --local`. A blank Access issuer/audience deliberately returns 503 from the API; it does not enable a development identity shortcut. The deployed route has no unsigned test-user header or first-visitor owner mode.

## Future apps and recovery

Adding an app to the catalog creates an `app.<id>.open` capability. Every separately deployed app must validate identity and enforce current membership and its required capability on its own server before serving private data. Launcher link visibility alone is not authorization. This release does not yet connect the alumni database or synchronize access with other apps.

Email/identity changes and loss of the last owner's sign-in require an operator recovery procedure with verified identity and an audit record. The normal UI does not let members rebind their identities. Changes use a global revision: if someone else saves first, reload and reapply your intended edit. This prevents a stale screen from overwriting a newer suspension or access change.
