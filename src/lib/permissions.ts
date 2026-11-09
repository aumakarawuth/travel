/**
 * Client/server mirror of the SQL permission rules (supabase/migrations/*_init.sql).
 * The database (RLS + RPC) is the source of truth; these helpers only decide what UI to show.
 */
export type TripRole = "owner" | "editor" | "member";

export const ROLE_RANK: Record<TripRole, number> = { owner: 3, editor: 2, member: 1 };

export function canEditTrip(role: TripRole | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

export function canDeleteTrip(role: TripRole | null | undefined): boolean {
  return role === "owner";
}

export function canManageInvites(role: TripRole | null | undefined): boolean {
  return canEditTrip(role);
}

/** Mirrors public.set_member_role(): only the owner, never on self. */
export function canChangeRole(actor: TripRole | null | undefined, actorId: string, targetId: string): boolean {
  return actor === "owner" && actorId !== targetId;
}

/** Mirrors public.remove_member(): owner removes non-owners; editor removes plain members. */
export function canRemoveMember(
  actor: TripRole | null | undefined,
  target: TripRole | null | undefined,
  actorId: string,
  targetId: string,
): boolean {
  if (!actor || !target || actorId === targetId || target === "owner") return false;
  if (actor === "owner") return true;
  return actor === "editor" && target === "member";
}

/** Anyone except the owner can leave (owner must transfer ownership first). */
export function canLeaveTrip(role: TripRole | null | undefined): boolean {
  return role === "editor" || role === "member";
}

/** Phase 6 selection rules — only owner/editor move places into the real plan. */
export function canSelectPlaces(role: TripRole | null | undefined): boolean {
  return canEditTrip(role);
}
