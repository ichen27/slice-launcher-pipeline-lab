import { z } from "zod";
import { apps } from "../lib/apps";

export const permissionCatalog = [
  { id: "members.read", label: "View member directory" },
  { id: "members.manage", label: "Add and manage members" },
  { id: "levels.manage", label: "Create and edit access levels" },
  { id: "audit.read", label: "View access history" },
  ...apps.map((app) => ({ id: `app.${app.id}.open`, label: `Open ${app.name}` })),
];
export interface Identity {
  subject: string;
  email: string;
}
export interface Member {
  id: string;
  subject: string | null;
  email: string;
  name: string;
  title: string;
  status: "pending" | "invited" | "active" | "suspended";
  levelId: string | null;
  allow: string[];
  deny: string[];
  owner: boolean;
  joinedAt: string;
}
export interface Level {
  id: string;
  name: string;
  permissions: string[];
}
export interface State {
  revision: number;
  ownerEmail: string | null;
  ownerClaimed: boolean;
  members: Member[];
  levels: Level[];
}
export interface Audit {
  id: string;
  at: string;
  actorId: string;
  action: string;
  targetId: string;
  before: unknown;
  after: unknown;
}
export interface Mutation {
  state: State;
  audit: Audit;
}
export interface Meta {
  id: string;
  now: string;
}
export interface DirectoryMember {
  id: string;
  name: string;
  title: string;
  levelName: string;
}
export interface View {
  revision: number;
  organization: string;
  me: Member;
  permissions: string[];
  members: (DirectoryMember | Member)[];
  levels: Level[];
  catalog: typeof permissionCatalog;
}
export class MembershipError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const permission = z
  .string()
  .refine((value) => permissionCatalog.some((item) => item.id === value), "Unknown permission");
const permissions = z
  .array(permission)
  .max(100)
  .transform((values) => [...new Set(values)].sort());
const id = z.string().min(1).max(80);
const name = z.string().trim().min(1).max(80);
export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("profile.update"), name, title: z.string().trim().max(100) }),
  z.strictObject({ type: z.literal("member.add"), email: emailSchema, name, levelId: id }),
  z.strictObject({
    type: z.literal("member.update"),
    id,
    status: z.enum(["pending", "invited", "active", "suspended"]),
    levelId: id.nullable(),
    allow: permissions,
    deny: permissions,
    owner: z.boolean(),
  }),
  z.strictObject({ type: z.literal("level.save"), id: id.optional(), name, permissions }),
]);
export type Command = z.infer<typeof commandSchema>;
