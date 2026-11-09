/** Minimal in-memory stand-in for the subset of supabase-js used by the pipeline (tests only). */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = { ...seed };
  const table = (t: string) => (db[t] ??= []);

  function builder(t: string) {
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | undefined;
    let opts: { onConflict?: string; ignoreDuplicates?: boolean; head?: boolean; count?: string } = {};
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "many" | "single" | "maybe" = "many";
    let returning = false;

    const run = () => {
      const rows = table(t);
      const match = (r: Row) => filters.every((f) => f(r));
      let out: Row[] = [];
      if (op === "insert" || op === "upsert") {
        for (const p of ([] as Row[]).concat(payload!)) {
          const keys = opts.onConflict?.split(",") ?? [];
          const existing = keys.length ? rows.find((r) => keys.every((k) => r[k] === p[k])) : undefined;
          if (existing) {
            if (op === "insert") return { data: null, error: { code: "23505", message: "duplicate" } };
            if (!opts.ignoreDuplicates) Object.assign(existing, p), out.push(existing);
            continue;
          }
          if (t === "places" && p.google_place_id && rows.some((r) => r.trip_id === p.trip_id && r.google_place_id === p.google_place_id))
            return { data: null, error: { code: "23505", message: "duplicate" } };
          const row = { id: p.id ?? uid(), created_at: new Date().toISOString(), ...p };
          rows.push(row); out.push(row);
        }
      } else if (op === "update") {
        out = rows.filter(match); out.forEach((r) => Object.assign(r, payload));
      } else if (op === "delete") {
        out = rows.filter(match); db[t] = rows.filter((r) => !match(r));
      } else out = rows.filter(match);
      if (opts.head) return { data: null, count: out.length, error: null };
      if (mode === "single") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: "not single" } };
      if (mode === "maybe") return { data: out[0] ?? null, error: null };
      return { data: op === "select" || returning ? out : null, error: null };
    };

    const b: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (op !== "select") returning = true; if (o) opts = { ...opts, ...o }; return b; },
      insert: (p: Row | Row[]) => { op = "insert"; payload = p; return b; },
      upsert: (p: Row | Row[], o?: typeof opts) => { op = "upsert"; payload = p; opts = { ...opts, ...o }; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      delete: () => { op = "delete"; return b; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return b; },
      gte: (k: string, v: string) => { filters.push((r) => (r[k] ?? "") >= v); return b; },
      not: (k: string, _o: string, v: unknown) => { filters.push((r) => (r[k] ?? null) !== v); return b; },
      order: () => b, limit: () => b, returns: () => b,
      single: () => { mode = "single"; return b; },
      maybeSingle: () => { mode = "maybe"; return b; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  }
  return { client: { from: builder } as any, db }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
