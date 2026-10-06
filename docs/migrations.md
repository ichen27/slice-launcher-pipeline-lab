# Membership migration policy

Migration files live in `apps/launcher/migrations` and apply in ordered, zero-padded sequence. Never rewrite an applied migration. Add a new migration and include the schema, application behavior, and recovery impact in the PR.

`pnpm test:migrations` exercises both an empty disposable local D1 database and the representative prior schema supplied by the test suite. Reviewers must confirm the fixture still represents the supported upgrade path. These tests do not use production records or establish that a live migration is safe.

Prefer additive changes: create new nullable/defaulted columns or tables, deploy code that understands old and new schema, backfill with bounded and resumable work, then validate the result. Remove old fields or constraints only in a later, separately reviewed cleanup after the rollback window closes. Do not ship code that requires an unapplied schema.

The release workflows deliberately do not apply production migrations. For a release requiring schema changes, Ivan (or the designated Slice release owner after handover) must approve the migration plan, confirm a D1 recovery point/export and its restoration procedure, and execute the ordered migration under separately authorized production credentials. Use the locked project Wrangler, explicit database/config and `--remote` only in that approved operation. Record migration IDs, time, operator, recovery reference, and verification evidence in the project knowledge base before deploying dependent code. Never place database contents or credentials in CI artifacts.

The operator must check whether the prior Worker version can read and write the resulting schema. A code rollback does not reverse D1 changes. Recover data with the documented D1 recovery mechanism under an explicit incident decision; never attempt a destructive reverse migration automatically. Coordinate writes and service availability when data recovery requires it.

If a change cannot be made backward compatible, provide a separate maintenance/recovery plan and approval before changing production. The existence of passing local migration tests does not authorize that operation.
