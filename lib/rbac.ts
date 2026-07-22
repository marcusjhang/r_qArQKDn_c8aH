// Role-based access control: the single source of truth for the role hierarchy
// and the permission checks derived from it. Framework-agnostic (no
// 'server-only') so server components/actions and client UI gate on the same
// rules. Roles are stored on users.role (see lib/schema.ts) and threaded onto
// the session in lib/auth.ts.

export const ROLES = ['reader', 'writer', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

// Higher rank ⇒ more privilege. owner sits at the top of the hierarchy:
// reader (view only) < writer (pipeline work) < admin (access control) < owner.
const RANK: Record<Role, number> = {
  reader: 0,
  writer: 1,
  admin: 2,
  owner: 3
};

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  );
}

// Normalize an unknown/absent role (e.g. off a session) to a concrete Role.
// Every user has at least the base 'reader' role, so that is the floor.
export function toRole(value: unknown): Role {
  return isRole(value) ? value : 'reader';
}

// True when `role` is at least as privileged as `min`.
export function hasAtLeast(role: unknown, min: Role): boolean {
  return RANK[toRole(role)] >= RANK[min];
}

// Day-to-day pipeline work (create/edit/move candidates, jobs, stages,
// feedback — the whole lib/hiring/actions.ts surface) is writer+.
export function canWrite(role: unknown): boolean {
  return hasAtLeast(role, 'writer');
}

// Managing the signup allowlist (who is allowed to join) is an admin-level
// capability — available to admins and owners.
export function canManageAllowlist(role: unknown): boolean {
  return hasAtLeast(role, 'admin');
}

// Assigning roles to users is admin+, but only an owner may grant/modify the
// owner role (enforced at the action layer — see setUserRole).
export function canManageRoles(role: unknown): boolean {
  return hasAtLeast(role, 'admin');
}

export function isOwner(role: unknown): boolean {
  return toRole(role) === 'owner';
}
