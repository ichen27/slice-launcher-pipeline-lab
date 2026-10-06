"use client";
import type { FormEvent } from "react";
import type { Command, Level, Member, View } from "./contracts";
export type Save = (command: Command) => Promise<void>;
function data(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
function list(form: FormData, key: string) {
  return form.getAll(key).map(String);
}
export function ProfileEditor({ view, save, busy }: { view: View; save: Save; busy: boolean }) {
  return (
    <form
      className="account-card form-stack"
      onSubmit={(event) => {
        const form = data(event);
        void save({ type: "profile.update", name: text(form, "name"), title: text(form, "title") });
      }}
    >
      <fieldset disabled={busy || view.me.status === "suspended"}>
        <legend>Profile details</legend>
        <label>
          Name
          <input
            name="name"
            autoComplete="name"
            defaultValue={view.me.name}
            required
            maxLength={80}
          />
        </label>
        <label>
          Title or role
          <input
            name="title"
            autoComplete="organization-title"
            defaultValue={view.me.title}
            maxLength={100}
          />
        </label>
        <label>
          Email
          <input value={view.me.email} readOnly />
        </label>
        <p className="field-note">
          Your email is verified through sign-in. Contact an administrator to change it.
        </p>
        <button className="primary-button" type="submit">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </fieldset>
    </form>
  );
}
export function PermissionChoices({
  view,
  selected = [],
  name = "permissions",
  disabled = false,
}: {
  view: View;
  selected?: string[];
  name?: string;
  disabled?: boolean;
}) {
  return (
    <div className="permission-list">
      {view.catalog.map((permission) => (
        <label className="check-label" key={permission.id}>
          <input
            type="checkbox"
            name={name}
            value={permission.id}
            defaultChecked={selected.includes(permission.id)}
            disabled={disabled || (!view.me.owner && !view.permissions.includes(permission.id))}
          />
          <span>{permission.label}</span>
        </label>
      ))}
    </div>
  );
}
export function AddMember({ view, save, busy }: { view: View; save: Save; busy: boolean }) {
  return (
    <form
      className="account-card form-stack"
      onSubmit={(event) => {
        const form = data(event);
        void save({
          type: "member.add",
          name: text(form, "name"),
          email: text(form, "email"),
          levelId: text(form, "levelId"),
        });
      }}
    >
      <fieldset disabled={busy}>
        <legend>Add member</legend>
        <label>
          Name
          <input name="name" required maxLength={80} />
        </label>
        <label>
          Email
          <input name="email" type="email" required maxLength={254} />
        </label>
        <label>
          Access level
          <select name="levelId" required>
            <option value="">Select a level</option>
            {view.levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </label>
        <p className="field-note">
          After adding the member, share the app URL with them. Their access activates when they
          sign in with this email. No invitation email is sent.
        </p>
        <button className="primary-button" type="submit">
          {busy ? "Saving…" : "Add member"}
        </button>
      </fieldset>
    </form>
  );
}
export function MemberEditor({
  view,
  member,
  save,
  busy,
}: {
  view: View;
  member: Member;
  save: Save;
  busy: boolean;
}) {
  const locked = !view.me.owner && (member.owner || member.id === view.me.id);
  const level = view.levels.find((item) => item.id === member.levelId);
  const effective =
    member.status !== "active"
      ? []
      : member.owner
        ? view.catalog.map((p) => p.id)
        : [...new Set([...(level?.permissions ?? []), ...member.allow])].filter(
            (p) => !member.deny.includes(p),
          );
  return (
    <form
      className="account-card form-stack"
      onSubmit={(event) => {
        const form = data(event);
        void save({
          type: "member.update",
          id: member.id,
          status: text(form, "status") as Member["status"],
          levelId: text(form, "levelId") || null,
          allow: list(form, "allow"),
          deny: list(form, "deny"),
          owner: view.me.owner ? form.has("owner") : member.owner,
        });
      }}
    >
      <fieldset disabled={busy || locked}>
        <legend>{member.name || member.email}</legend>
        <p className="field-note">{member.email}</p>
        {locked && <p className="notice">An owner must make changes to this member.</p>}
        <label>
          Status
          <select name="status" defaultValue={member.status}>
            <option value="pending">Pending approval</option>
            {member.subject ? (
              <option value="active">Active</option>
            ) : (
              <option value="invited">Invited</option>
            )}
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label>
          Access level
          <select name="levelId" defaultValue={member.levelId ?? ""}>
            <option value="">No level assigned</option>
            {view.levels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {view.me.owner && (
          <label className="check-label">
            <input type="checkbox" name="owner" defaultChecked={member.owner} />
            <span>Organization owner</span>
          </label>
        )}
        {member.owner ? (
          <p className="field-note">
            Owners have all permissions. At least one active owner must remain.
          </p>
        ) : (
          <>
            <h3>Individual permissions</h3>
            <p className="field-note">
              Allow adds to the access level. Revoke overrides the level and individual allows.
            </p>
            <h4>Allow</h4>
            <PermissionChoices view={view} selected={member.allow} name="allow" />
            <h4>Revoke</h4>
            <PermissionChoices view={view} selected={member.deny} name="deny" />
          </>
        )}
        <button className="primary-button" type="submit">
          {busy ? "Saving…" : "Save access"}
        </button>
      </fieldset>
      <section className="effective-access">
        <h3>Current effective access</h3>
        <p className="field-note">Reflects the last saved changes.</p>
        {effective.length ? (
          <ul>
            {effective.map((p) => (
              <li key={p}>{view.catalog.find((item) => item.id === p)?.label ?? p}</li>
            ))}
          </ul>
        ) : (
          <p>No permissions.</p>
        )}
      </section>
    </form>
  );
}
export function LevelEditor({
  view,
  level,
  save,
  busy,
}: {
  view: View;
  level?: Level;
  save: Save;
  busy: boolean;
}) {
  const locked = !view.me.owner && level?.id === view.me.levelId;
  return (
    <form
      className="account-card form-stack"
      onSubmit={(event) => {
        const form = data(event);
        void save({
          type: "level.save",
          ...(level ? { id: level.id } : {}),
          name: text(form, "name"),
          permissions: list(form, "permissions"),
        });
      }}
    >
      <fieldset disabled={busy || locked}>
        <legend>{level ? "Edit access level" : "Create access level"}</legend>
        {locked && <p className="notice">An owner must change your assigned access level.</p>}
        <label>
          Name
          <input name="name" defaultValue={level?.name ?? ""} required maxLength={80} />
        </label>
        <h3>Permissions</h3>
        <PermissionChoices view={view} selected={level?.permissions} />
        {level && (
          <p className="field-note">
            Saving changes updates access for everyone assigned to this level.
          </p>
        )}
        <button className="primary-button" type="submit">
          {busy ? "Saving…" : level ? "Save access level" : "Create access level"}
        </button>
      </fieldset>
    </form>
  );
}
