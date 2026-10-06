import { MembershipError } from "./contracts";
import type { Audit, Level, Member, Mutation, State } from "./contracts";

type Database = Pick<D1Database, "prepare" | "batch">;
export class Repository {
  constructor(private db: Database) {}
  async load(): Promise<State> {
    const results = await this.db.batch<Record<string, unknown>>([
      this.db.prepare(
        "SELECT revision, owner_email, owner_claimed FROM organization WHERE id = 'slice'",
      ),
      this.db.prepare("SELECT document FROM members ORDER BY id"),
      this.db.prepare("SELECT document FROM access_levels ORDER BY name"),
    ]);
    const meta = results[0].results[0];
    if (!meta) throw new MembershipError(503, "Membership storage is not configured.");
    return {
      revision: Number(meta.revision),
      ownerEmail: meta.owner_email as string | null,
      ownerClaimed: Boolean(meta.owner_claimed),
      members: results[1].results.map((row) => JSON.parse(String(row.document)) as Member),
      levels: results[2].results.map((row) => JSON.parse(String(row.document)) as Level),
    };
  }
  async commit(before: State, mutation: Mutation): Promise<void> {
    const { state, audit } = mutation;
    const statements = [
      this.db
        .prepare(
          "INSERT INTO mutation_guard (id, permitted) VALUES (?, COALESCE((SELECT revision = ? FROM organization WHERE id = 'slice'), 0))",
        )
        .bind(audit.id, before.revision),
    ];
    for (const level of state.levels) {
      if (JSON.stringify(before.levels.find((l) => l.id === level.id)) === JSON.stringify(level))
        continue;
      statements.push(
        this.db
          .prepare(
            "INSERT INTO access_levels(id, name, document) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, document=excluded.document",
          )
          .bind(level.id, level.name, JSON.stringify(level)),
      );
    }
    for (const member of state.members) {
      if (JSON.stringify(before.members.find((m) => m.id === member.id)) === JSON.stringify(member))
        continue;
      statements.push(
        this.db
          .prepare(
            "INSERT INTO members(id, email, subject, document) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, subject=excluded.subject, document=excluded.document",
          )
          .bind(member.id, member.email, member.subject, JSON.stringify(member)),
      );
    }
    statements.push(
      this.db
        .prepare("UPDATE organization SET revision = ?, owner_claimed = ? WHERE id = 'slice'")
        .bind(state.revision, state.ownerClaimed ? 1 : 0),
      this.db
        .prepare("INSERT INTO access_audit(id, at, document) VALUES (?, ?, ?)")
        .bind(audit.id, audit.at, JSON.stringify(audit)),
      this.db.prepare("DELETE FROM mutation_guard WHERE id = ?").bind(audit.id),
    );
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (error instanceof Error && /membership_revision_match/.test(error.message))
        throw new MembershipError(409, "Membership changed. Reload and try again.");
      throw error;
    }
  }
  async history(): Promise<Audit[]> {
    const result = await this.db
      .prepare("SELECT document FROM access_audit ORDER BY at DESC, rowid DESC LIMIT 50")
      .all<{ document: string }>();
    return result.results.map((row) => JSON.parse(row.document) as Audit);
  }
}
