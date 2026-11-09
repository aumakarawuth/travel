/** Invite code helpers. Codes are 8 hex chars (uppercased); tokens are 36 hex chars. */
const CODE_RE = /^[0-9A-F]{8}$/;
const TOKEN_RE = /^[0-9a-f]{36}$/;

export function normalizeInviteInput(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  let candidate = input;
  // accept a full invite link: https://host/join/ABCD1234
  try {
    const u = new URL(input);
    const m = u.pathname.match(/\/join\/([^/?#]+)/);
    if (!m) return null;
    candidate = decodeURIComponent(m[1]);
  } catch {
    /* not a URL — treat as raw code */
  }
  if (TOKEN_RE.test(candidate.toLowerCase())) return candidate.toLowerCase();
  const code = candidate.replace(/[\s-]/g, "").toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function inviteUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/$/, "")}/join/${encodeURIComponent(code)}`;
}
