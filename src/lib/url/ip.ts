/** Classifies IP addresses so the fetcher can refuse private / reserved targets (SSRF guard). */
import { isIP } from "node:net";

function v4ToInt(ip: string) {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function v4Blocked(ip: string) {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  let tail: number[] = [];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]);
    tail = [n >>> 16, n & 0xffff];
    s = s.slice(0, -v4[1].length);
    if (s.endsWith(":") && !s.endsWith("::")) s = s.slice(0, -1);
  }
  const [head, rest] = s.split("::");
  const h = head ? head.split(":").filter(Boolean).map((x) => parseInt(x, 16)) : [];
  const r = rest !== undefined ? (rest ? rest.split(":").filter(Boolean).map((x) => parseInt(x, 16)) : []) : [];
  const need = 8 - tail.length;
  if (rest === undefined) {
    const all = [...h, ...tail];
    return all.length === 8 ? all : null;
  }
  const zeros = need - h.length - r.length;
  if (zeros < 0) return null;
  return [...h, ...Array(zeros).fill(0), ...r, ...tail];
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Blocked(ip);
  if (kind !== 6) return true; // not an IP → refuse
  const w = expandV6(ip);
  if (!w) return true;
  if (w.every((x) => x === 0)) return true; // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1
  // IPv4-mapped / compatible / NAT64 → check embedded v4
  const embedded = `${w[6] >>> 8}.${w[6] & 255}.${w[7] >>> 8}.${w[7] & 255}`;
  if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0xffff || w[5] === 0)) return v4Blocked(embedded);
  if (w[0] === 0x64 && w[1] === 0xff9b) return v4Blocked(embedded);
  const first = w[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && w[1] === 0x0db8) return true; // documentation
  if (first === 0x2002) return v4Blocked(`${w[1] >>> 8}.${w[1] & 255}.${w[2] >>> 8}.${w[2] & 255}`); // 6to4
  return false;
}
