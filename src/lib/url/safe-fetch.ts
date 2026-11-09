import "server-only";
import { lookup } from "node:dns/promises";
import { Agent, fetch as ufetch } from "undici";
import { checkUrl } from "./normalize";
import { isBlockedIp } from "./ip";

export class SafeFetchError extends Error {
  constructor(public code: "blocked_url" | "blocked_ip" | "too_many_redirects" | "timeout" | "http_error" | "too_large" | "bad_content_type" | "network", msg?: string) {
    super(msg ?? code);
  }
}

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const UA = "TripSyncBot/1.0 (+link preview; respects robots/terms)";

/**
 * DNS is resolved inside the socket connect hook and every resolved address is checked,
 * so a hostname cannot pass validation and then rebind to a private IP (TOCTOU).
 */
const agent = new Agent({
  connect: {
    lookup: (hostname, _opts, cb) => {
      lookup(hostname, { all: true, verbatim: true })
        .then((addrs) => {
          const bad = addrs.find((a) => isBlockedIp(a.address));
          if (!addrs.length || bad) return cb(new SafeFetchError("blocked_ip", `blocked ${bad?.address ?? hostname}`), "", 4);
          cb(null, addrs[0].address, addrs[0].family);
        })
        .catch((e) => cb(e, "", 4));
    },
  },
  headersTimeout: 8_000,
  bodyTimeout: 8_000,
});

export type SafeFetchResult = { finalUrl: string; status: number; contentType: string; body: string; redirects: string[] };

export async function safeFetch(rawUrl: string, opts: { accept?: string; timeoutMs?: number; json?: boolean } = {}): Promise<SafeFetchResult> {
  let current = rawUrl;
  const redirects: string[] = [];
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? 10_000);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkUrl(current);
    if (!check.ok) throw new SafeFetchError("blocked_url", check.reason);
    let res;
    try {
      res = await ufetch(check.url, {
        dispatcher: agent,
        redirect: "manual",
        signal: deadline,
        headers: { "user-agent": UA, accept: opts.accept ?? "text/html,application/xhtml+xml", "accept-language": "th,en;q=0.8" },
      });
    } catch (e) {
      const err = e as Error & { cause?: unknown };
      if (err.cause instanceof SafeFetchError) throw err.cause;
      if (err.name === "TimeoutError" || err.name === "AbortError") throw new SafeFetchError("timeout");
      throw new SafeFetchError("network", err.message);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      redirects.push(current);
      current = new URL(res.headers.get("location")!, check.url).toString();
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new SafeFetchError("http_error", String(res.status));
    }
    const contentType = res.headers.get("content-type") ?? "";
    const okType = opts.json ? /json/i.test(contentType) : /text\/html|application\/xhtml/i.test(contentType);
    if (!okType) {
      await res.body?.cancel();
      // non-HTML final targets (images/PDF) are fine for URL resolution, just without body
      return { finalUrl: current, status: res.status, contentType, body: "", redirects };
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      await res.body?.cancel();
      throw new SafeFetchError("too_large");
    }
    let body = "";
    const decoder = new TextDecoder();
    let size = 0;
    for await (const chunk of res.body!) {
      size += chunk.byteLength;
      body += decoder.decode(chunk, { stream: true });
      if (size > MAX_BYTES) break; // keep what we have — the <head> is what matters
    }
    return { finalUrl: current, status: res.status, contentType, body, redirects };
  }
  throw new SafeFetchError("too_many_redirects");
}
