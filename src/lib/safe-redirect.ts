/** Only allow same-origin relative paths for post-login redirects (prevents open redirect). */
export function safeNextPath(next: string | null | undefined, fallback = "/trips"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://x.invalid");
    if (u.host !== "x.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
