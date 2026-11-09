import type { ZodError } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const KNOWN = [
  "not_authenticated", "rate_limited", "invalid_invite", "invite_email_mismatch", "trip_full", "forbidden",
  "cannot_change_own_role", "not_a_member", "cannot_remove_owner",
];

/** Map Postgres/PostgREST errors to stable codes without leaking internals to the client. */
export function dbErrorCode(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "generic";
  const known = KNOWN.find((k) => err.message?.includes(k));
  if (known) return known;
  if (err.code === "42501") return "forbidden";
  console.error("[db]", err.code, err.message);
  return "generic";
}

export function zodFieldErrors(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const k = issue.path.join(".") || "_";
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
