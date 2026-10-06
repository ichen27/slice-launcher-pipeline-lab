# Membership management

Approved scope: profiles, organization directory, custom access levels, individual overrides, invitations, and pending approval after first sign-in.

## Behavior

- Unknown verified identities can create a profile and request membership. Pending users can only read/update their own profile and status.
- Admins can pre-provision members by email with an access level; the admin shares the login URL. Email delivery is a separate integration.
- Active members have one level plus individual allow/deny exceptions; deny wins. Level changes affect all assigned members. Permissions come from implemented application capabilities.
- Self-editable fields: display name and title. Verified identity and permissions are administrator controlled. Ordinary directory responses omit email and administrative details.
- Administrators cannot delegate beyond their current effective permissions or escalate through editing their own level. Ownership is explicitly managed by owners; never remove the last active owner.
- Administrative changes have an atomic audit record with actor and before/after state.

## Architecture

One server-selected Slice organization initially. Verified Cloudflare Access JWTs supply identity; D1 stores members, levels, organization revision and audit records. Current membership is checked on each protected request. APIs fail closed without configured identity/storage.

Mutations use a consistent snapshot and optimistic revision checking. A D1 batch constraint guard rejects stale revisions and rolls back changes/audit atomically; conflicts return 409 for explicit reload. No token claim supplies lasting authorization.

An authenticated onboarding boundary must remain reachable by pending members. Initially Access verifies identity at the launcher, while the application checks membership. Member-only external evaluation can be added to separate app destinations later. Every independently deployed app must validate identity and its own permissions; hidden launcher links are not sufficient.

## Release and validation

Owner email must be explicitly supplied and bootstrapped by an operator, never inferred from first sign-in. Real issuer/audience and provider configuration are prerequisites for production activation. Local tests use synthetic users and signed test JWTs; no deployed identity bypass.

Test pending/suspended denial, identity binding, duplicate sign-ins, profile restrictions, role edits, overrides, privilege escalation, concurrency, atomic audit, last-owner protection, invalid JWTs, origin checks and response privacy. Preserve the minimal applications-first UI and existing CI.
