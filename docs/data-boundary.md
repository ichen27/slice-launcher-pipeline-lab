# Public code and private data

This repository is public. Application code, schemas, migrations, and synthetic test fixtures can be reviewed here. The alumni database and other confidential records belong in separately controlled storage and never in Git history, issues, pull requests, build logs, or client bundles.

- Store production secrets in Cloudflare and GitHub environment secrets, not source files. Local `.env` and `.dev.vars` files are ignored by Git; use example files with placeholder values only.
- Browser code may contain only data intended to be public. Keep database credentials and confidential queries in server-side code with an authorization check.
- Use synthetic or explicitly approved non-confidential test data. Never copy a production database to create a fixture.
- Review new dependencies, logs, and error handling for accidental exposure before merging.
- If a secret is committed, rotate it and remove it from Git history before continuing; deleting it from the latest commit is insufficient.

The current launcher has no database connection, alumni records, or in-app sign-in. Keep private content out until server-side authentication and authorization are implemented and tested.
