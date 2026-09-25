/**
 * Pure admin policy rules. No I/O, so they are unit-tested directly and
 * every mutation path (server action, CLI, tests) applies the same checks.
 */
export type Role = "user" | "dealer" | "admin";
export type Status = "active" | "disabled" | "blocked";
export type ServiceStatus = "requested" | "in_progress" | "complete" | "cancelled" | "declined";

export interface Actor {
  id: string;
  role: Role;
}
export interface TargetUser {
  id: string;
  role: Role;
  status: Status;
}

export const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  disabled: "Disabled",
  blocked: "Blocked",
};

/** Returns an error message when `actor` may not move `target` to `next`, else null. */
export function statusChangeError(actor: Actor, target: TargetUser, next: Status): string | null {
  if (actor.role !== "admin") return "Admins only.";
  if (actor.id === target.id) return "You cannot change your own account status.";
  if (target.role === "admin") return "Admin accounts cannot be disabled or blocked here.";
  if (target.status === next) return `Account is already ${STATUS_LABEL[next].toLowerCase()}.`;
  return null;
}

/** Returns an error message when `actor` may not set `target`'s role to `next`, else null. */
export function roleChangeError(actor: Actor, target: TargetUser, next: Role): string | null {
  if (actor.role !== "admin") return "Admins only.";
  if (actor.id === target.id) return "You cannot change your own role.";
  if (target.role === "admin") return "Admin roles are managed with the CLI (pnpm users:role).";
  if (next === "admin")
    return "Promote to admin with the CLI (pnpm users:role), not from the console.";
  if (target.role === next) return `User is already a ${next}.`;
  return null;
}

/** Whether a service order in `status` may take `action`. */
export function serviceTransitionError(
  status: ServiceStatus,
  action: "start" | "complete" | "decline",
): string | null {
  const open = status === "requested" || status === "in_progress";
  if (!open) return `Order is already ${status.replace("_", " ")}.`;
  if (action === "start" && status === "in_progress") return "Order is already in progress.";
  return null;
}

export const PAGE_SIZE = 50;

/** Parses a page number from a search param: 1-based, bounded. */
export function parsePage(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

/** Normalizes a free-text search query for ILIKE use (escapes wildcards, caps length). */
export function normalizeQuery(v: string | undefined): string {
  return (v ?? "")
    .trim()
    .replace(/[%_\\]/g, (c) => `\\${c}`)
    .slice(0, 80);
}
