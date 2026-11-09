import type { LatLng, TravelFn } from "./types";

type P = LatLng & { id: string };

function routeCost<T extends P>(seq: T[], start: LatLng | null, end: LatLng | null, travel: TravelFn) {
  let c = 0;
  let prev: LatLng | null = start;
  for (const p of seq) { if (prev) c += travel(prev, p).minutes; prev = p; }
  if (end && prev) c += travel(prev, end).minutes;
  return c;
}

/** Nearest neighbour from the start point (or the place closest to the end if there is no start). */
export function nearestNeighbour<T extends P>(places: T[], start: LatLng | null, travel: TravelFn): T[] {
  const left = [...places];
  const out: T[] = [];
  let cur: LatLng | null = start;
  while (left.length) {
    let bi = 0;
    if (cur) {
      let best = Infinity;
      left.forEach((p, i) => { const m = travel(cur!, p).minutes; if (m < best || (m === best && p.id < left[bi].id)) { best = m; bi = i; } });
    }
    const [n] = left.splice(bi, 1);
    out.push(n);
    cur = n;
  }
  return out;
}

/** 2-opt local improvement with fixed (optional) endpoints — removes crossings / back-tracking. */
export function twoOpt<T extends P>(seq: T[], start: LatLng | null, end: LatLng | null, travel: TravelFn, maxIter = 50): T[] {
  let best = [...seq];
  let bestCost = routeCost(best, start, end, travel);
  for (let iter = 0, improved = true; improved && iter < maxIter; iter++) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const c = routeCost(cand, start, end, travel);
        if (c < bestCost - 0.01) { best = cand; bestCost = c; improved = true; }
      }
    }
  }
  return best;
}

/** Cheapest insertion of `extra` into a fixed base sequence (used when some stops are locked). */
export function cheapestInsertion<T extends P>(base: T[], extra: T[], start: LatLng | null, end: LatLng | null, travel: TravelFn): T[] {
  const seq = [...base];
  for (const p of extra) {
    let bestI = seq.length, bestCost = Infinity;
    for (let i = 0; i <= seq.length; i++) {
      const c = routeCost([...seq.slice(0, i), p, ...seq.slice(i)], start, end, travel);
      if (c < bestCost) { bestCost = c; bestI = i; }
    }
    seq.splice(bestI, 0, p);
  }
  return seq;
}

export { routeCost };
