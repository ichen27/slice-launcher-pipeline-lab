"use client";
import { useCallback, useEffect, useState } from "react";
import type { Audit, Command, Member, View } from "./contracts";
import { AddMember, LevelEditor, MemberEditor, ProfileEditor } from "./editors";

type Tab = "profile" | "members" | "levels" | "history";
async function readResponse(response: Response) {
  const body = (await response.json()) as { error?: string } & Partial<View>;
  if (!response.ok) throw new Error(body.error ?? "Unable to load membership.");
  return body;
}
export function MembershipWorkspace() {
  const [view, setView] = useState<View | null>(null);
  const [enroll, setEnroll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("profile");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<Audit[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/membership", { cache: "no-store", redirect: "error" });
      const result = (await readResponse(response)) as View & { needsEnrollment?: boolean };
      setEnroll(Boolean(result.needsEnrollment));
      setView(result.me ? result : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load membership.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (command: Command | { type: "join" }) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/membership", {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: view?.revision, command }),
      });
      const result = (await readResponse(response)) as View;
      setView(result);
      setEnroll(false);
      setNotice(command.type === "join" ? "Profile created." : "Changes saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save changes.");
    } finally {
      setBusy(false);
    }
  };
  const showTab = async (next: Tab) => {
    setTab(next);
    setSelected("");
    setSearch("");
    setNotice("");
    setError("");
    if (next === "history") {
      setBusy(true);
      try {
        const response = await fetch("/api/membership?view=history", {
          cache: "no-store",
          redirect: "error",
        });
        const result = (await readResponse(response)) as unknown as { history: Audit[] };
        setHistory(result.history);
      } catch (e) {
        setHistory([]);
        setError(e instanceof Error ? e.message : "Unable to load history.");
      } finally {
        setBusy(false);
      }
    }
  };
  const can = (permission: string) => view?.permissions.includes(permission) ?? false;
  const tabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: "profile", label: "My profile", visible: true },
    { id: "members", label: "Members", visible: can("members.read") || can("members.manage") },
    { id: "levels", label: "Access levels", visible: can("levels.manage") },
    { id: "history", label: "Activity", visible: can("audit.read") },
  ];
  const activeTab = tabs.find((item) => item.id === tab)?.visible ? tab : "profile";
  const members =
    view?.members.filter((member) =>
      `${member.name} ${member.title} ${"email" in member ? member.email : ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const person = view?.members.find((member) => member.id === selected);
  return (
    <>
      <div className="account-heading">
        <div>
          <p className="eyebrow">Slice Consulting</p>
          <h1>Organization</h1>
        </div>
        {view && (
          <button
            className="secondary-button"
            onClick={() => void load()}
            disabled={busy || loading}
          >
            Refresh
          </button>
        )}
      </div>
      {error && (
        <div className="notice error-notice" role="alert">
          {error}{" "}
          {view && (
            <button className="text-button" onClick={() => void load()} disabled={busy}>
              Reload latest changes
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading && <p role="status">Loading your account…</p>}
      {!loading && !view && !enroll && (
        <section className="account-card sign-in-card">
          <h2>Sign in to Slice</h2>
          <p>Use your verified email to access your profile and organization.</p>
          <a className="primary-button" href="/api/membership/login">
            Sign in
          </a>
        </section>
      )}
      {!loading && enroll && (
        <section className="account-card sign-in-card">
          <h2>Create your member profile</h2>
          <p>
            Your verified email will be linked to your profile. An administrator will review your
            access.
          </p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void save({ type: "join" })}
          >
            {busy ? "Creating…" : "Continue"}
          </button>
        </section>
      )}
      {view && (
        <>
          <nav className="account-tabs" aria-label="Organization sections">
            {tabs
              .filter((item) => item.visible)
              .map((item) => (
                <button
                  key={item.id}
                  aria-current={activeTab === item.id ? "page" : undefined}
                  disabled={busy}
                  onClick={() => void showTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
          </nav>
          {activeTab === "profile" && (
            <div className="profile-grid">
              <aside className="account-card profile-summary">
                <span className="profile-avatar" aria-hidden="true">
                  {(view.me.name || "Member").charAt(0).toUpperCase()}
                </span>
                <h2>{view.me.name || "Your profile"}</h2>
                <p>{view.me.title || "Slice Consulting"}</p>
                <span className={`status-badge status-${view.me.status}`}>
                  {view.me.status === "pending" ? "Pending approval" : view.me.status}
                </span>
                <p className="field-note">
                  {view.me.owner
                    ? "Organization owner"
                    : "Your access is managed by the organization."}
                </p>
                <a className="text-button" href="/cdn-cgi/access/logout">
                  Sign out
                </a>
              </aside>
              <div>
                {view.me.status === "pending" && (
                  <p className="notice">
                    Your profile is ready. An administrator needs to approve your membership and
                    assign an access level.
                  </p>
                )}
                {view.me.status === "suspended" && (
                  <p className="notice">
                    Your access has been suspended. Contact an organization owner.
                  </p>
                )}
                <ProfileEditor key={view.revision} view={view} save={save} busy={busy} />
              </div>
            </div>
          )}
          {activeTab === "members" && (
            <>
              <div className="section-toolbar">
                <label className="search-label">
                  <span className="sr-only">Search members</span>
                  <input
                    type="search"
                    placeholder="Search members"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                {can("members.manage") && (
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => setSelected("new")}
                  >
                    Add member
                  </button>
                )}
              </div>
              <div className={can("members.manage") ? "management-grid" : "directory-grid"}>
                <section className="account-card member-list" aria-label="Organization members">
                  {members.length === 0 && <p>No members found.</p>}
                  {members.map((member) => {
                    const details = (
                      <>
                        <span className="member-avatar" aria-hidden="true">
                          {(member.name || "Member").charAt(0).toUpperCase()}
                        </span>
                        <span className="member-copy">
                          <strong>{member.name || "Member"}</strong>
                          <small>
                            {"email" in member ? member.email : member.title || member.levelName}
                          </small>
                        </span>
                        {"status" in member && (
                          <span className={`status-badge status-${member.status}`}>
                            {member.status}
                          </span>
                        )}
                      </>
                    );
                    return can("members.manage") ? (
                      <button
                        className="member-row"
                        key={member.id}
                        aria-pressed={selected === member.id}
                        disabled={busy}
                        onClick={() => setSelected(member.id)}
                      >
                        {details}
                      </button>
                    ) : (
                      <div className="member-row" key={member.id}>
                        {details}
                      </div>
                    );
                  })}
                </section>
                {can("members.manage") &&
                  (selected === "new" ? (
                    <AddMember key={`new-${view.revision}`} view={view} save={save} busy={busy} />
                  ) : person && "email" in person ? (
                    <MemberEditor
                      key={`${person.id}-${view.revision}`}
                      view={view}
                      member={person as Member}
                      save={save}
                      busy={busy}
                    />
                  ) : (
                    <div className="account-card selection-hint">
                      Select a member to manage their access.
                    </div>
                  ))}
              </div>
            </>
          )}
          {activeTab === "levels" && (
            <>
              <div className="section-toolbar">
                <p>Set the permissions members share.</p>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => setSelected("new")}
                >
                  Create access level
                </button>
              </div>
              <div className="management-grid">
                <section className="account-card member-list" aria-label="Access levels">
                  {view.levels.map((level) => (
                    <button
                      className="member-row"
                      key={level.id}
                      aria-pressed={selected === level.id}
                      disabled={busy}
                      onClick={() => setSelected(level.id)}
                    >
                      <span className="member-copy">
                        <strong>{level.name}</strong>
                        <small>{level.permissions.length} permissions</small>
                      </span>
                    </button>
                  ))}
                </section>
                {selected ? (
                  <LevelEditor
                    key={`${selected}-${view.revision}`}
                    view={view}
                    level={view.levels.find((level) => level.id === selected)}
                    save={save}
                    busy={busy}
                  />
                ) : (
                  <div className="account-card selection-hint">
                    Select an access level to edit its permissions.
                  </div>
                )}
              </div>
            </>
          )}
          {activeTab === "history" && (
            <section className="account-card activity-list">
              <h2>Recent activity</h2>
              <p className="field-note">The latest 50 membership changes.</p>
              {busy ? (
                <p role="status">Loading activity…</p>
              ) : history.length === 0 ? (
                <p>No activity to display.</p>
              ) : (
                <ol>
                  {history.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.action.replaceAll(".", " ")}</strong>
                        <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time>
                      </div>
                      <p className="field-note">
                        By{" "}
                        {view.members.find((member) => member.id === item.actorId)?.name ??
                          "Member"}{" "}
                        ·{" "}
                        {view.members.find((member) => member.id === item.targetId)?.name ??
                          view.levels.find((level) => level.id === item.targetId)?.name ??
                          item.targetId}
                      </p>
                      <details>
                        <summary>View change</summary>
                        <pre>
                          {JSON.stringify({ before: item.before, after: item.after }, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
