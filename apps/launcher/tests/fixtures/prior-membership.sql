-- Frozen schema from main 178f527; do not update when adding migrations.
CREATE TABLE organization (
  id TEXT PRIMARY KEY CHECK (id = 'slice'),
  revision INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT,
  owner_claimed INTEGER NOT NULL DEFAULT 0 CHECK (owner_claimed IN (0, 1))
);
INSERT INTO organization(id) VALUES ('slice');
CREATE TABLE access_levels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  document TEXT NOT NULL CHECK (json_valid(document))
);
INSERT INTO access_levels(id, name, document) VALUES ('member', 'Member', '{"id":"member","name":"Member","permissions":["members.read"]}');
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  subject TEXT UNIQUE,
  document TEXT NOT NULL CHECK (json_valid(document))
);
CREATE TABLE access_audit (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);
CREATE INDEX access_audit_at ON access_audit(at DESC);
CREATE TABLE mutation_guard (
  id TEXT PRIMARY KEY,
  permitted INTEGER NOT NULL CONSTRAINT membership_revision_match CHECK (permitted = 1)
);
