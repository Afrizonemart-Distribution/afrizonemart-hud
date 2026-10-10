import type { CacheOutcome, PulseGroup, PulseParticle, PulseSnapshot } from './pulseTypes';

/**
 * SIMULATED server pulse — a queueing model of one small API box, so the
 * Backend Arcade can replay the k6 video's experiment before the real
 * load-test environment exists. Every number here is a model, not a
 * measurement; the page labels SIM mode loudly.
 *
 * Shape follows the video: ~0.093 req/s per shopper (232 req/s at 2,500),
 * ~3.4 ms of CPU per uncached request on 1 vCPU, latency that's flat
 * until CPU gets busy and then blows up in the tail (p95 first), and a
 * 1 s cache whose hit rate depends on how many distinct keys each
 * request type has (catalog: a few; listings: ~600; products: ~3,100).
 * Search and recommendations are never cached (as in the real API).
 */

const REQ_PER_SHOPPER = 0.093;
const COST_MISS_MS = 3.4;
const COST_HIT_MS = 0.6;
const BASE_MS = 4.5;

// group, share of traffic, distinct cache keys (0 = never cached).
// A 1 s entry only helps when the same key is asked for again within
// the second, so hit rate depends on how spread out the keys are:
// a handful of catalog/content keys, ~600 category listings, ~3,100
// product pages (Afrizonemart's real catalog sizes).
const MIX: Array<[PulseGroup, number, number]> = [
  ['product', 0.3, 3100],
  ['browse', 0.25, 600],
  ['catalog', 0.2, 4],
  ['search', 0.13, 0],
  ['recs', 0.12, 0],
];

/** Chance a request finds its key already cached this second. */
function hitChance(groupRps: number, keys: number): number {
  if (!keys) return 0;
  const perKey = groupRps / keys;
  return perKey / (perKey + 1);
}

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pickGroup(): [PulseGroup, number] {
  let r = Math.random();
  for (const [g, share, keys] of MIX) {
    if ((r -= share) <= 0) return [g, keys];
  }
  return ['product', 3100];
}

export class PulseSim {
  players = 10;
  cacheOn = false;
  private backlog = 0; // requests queued beyond capacity
  private window: number[] = []; // last ~5 s of sampled latencies

  step(dtMs = 500): PulseSnapshot {
    const dt = dtMs / 1000;
    const rps = this.players * REQ_PER_SHOPPER * (0.95 + Math.random() * 0.1);

    const cacheableShare = MIX.filter(([, , k]) => k > 0).reduce((a, [, s]) => a + s, 0);
    const hitOf = new Map(MIX.map(([g, share, keys]) => [g, this.cacheOn ? hitChance(rps * share, keys) : 0]));
    const hitShare = MIX.reduce((a, [g, share]) => a + share * (hitOf.get(g) ?? 0), 0);
    const keyHit = cacheableShare ? hitShare / cacheableShare : 0;
    const avgCost = hitShare * COST_HIT_MS + (1 - hitShare) * COST_MISS_MS;

    const capacity = 1000 / avgCost; // req/s one core can serve
    const util = rps / capacity;
    this.backlog = Math.max(0, this.backlog + (rps - capacity) * dt);
    const queueMs = (this.backlog / capacity) * 1000;

    const q = 1 / (1 - Math.min(util, 0.985));
    const p50 = BASE_MS * (1 + util * 0.45) + queueMs;
    const p95 = Math.min(4000, BASE_MS * 2 * Math.pow(q, 2.2)) + queueMs;
    const p99 = Math.min(9000, p95 * 2.4) + queueMs * 0.5;
    // Past ~97% CPU requests start timing out.
    const errRate = Math.min(60, Math.max(0, (util - 0.97) * 150) + (queueMs > 3000 ? (queueMs - 3000) / 100 : 0));

    // Individual requests to animate, drawn from that distribution.
    const n = Math.min(60, Math.max(1, Math.round(rps * dt)));
    const particles: PulseParticle[] = [];
    for (let i = 0; i < n; i++) {
      const [g, keys] = pickGroup();
      const hit = Math.random() < (hitOf.get(g) ?? 0);
      const c: CacheOutcome | undefined = keys > 0 && this.cacheOn ? (hit ? 'hit' : 'miss') : undefined;
      const tail = Math.random();
      let ms = p50 * Math.exp(randn() * 0.35);
      if (tail > 0.95) ms = p95 + Math.random() * (p99 - p95);
      if (hit) ms = Math.max(0.5, ms * 0.35);
      const failed = Math.random() * 100 < errRate;
      particles.push({ g, ms: Math.round(ms), s: failed ? 503 : 200, c, db: hit ? 0 : g === 'search' ? 3 : 2 });
    }

    this.window.push(p50, p95, p99);
    if (this.window.length > 30) this.window.splice(0, this.window.length - 30);

    const hits = Math.round(rps * dt * hitShare);
    const misses = this.cacheOn ? Math.round(rps * dt * cacheableShare) - hits : 0;
    const r1 = (x: number) => Math.round(x * 10) / 10;

    return {
      t: Date.now(),
      rps: r1(rps),
      inflight: Math.round(rps * (p50 / 1000) + this.backlog),
      players: { loadtest: this.players, shoppers: 0 },
      lat: { p50: r1(p50), p95: r1(p95), p99: r1(p99), max: r1(p99 * 1.4) },
      errors: { rate: r1(errRate), s5xx: Math.round(rps * 5 * (errRate / 100)), s4xx: 0 },
      groups: MIX.map(([g, share]) => ({ g, rps: r1(rps * share), p95: r1(p95) })),
      cache: {
        hit: hits,
        shared: 0,
        miss: Math.max(0, misses),
        hitRate: this.cacheOn ? Math.round(keyHit * 100) : 0,
        ttlMs: this.cacheOn ? 1000 : 0,
      },
      db: { qps: r1(rps * (1 - hitShare) * 2), avgMs: r1(1 + util * 2), inflight: Math.round(util * 4) },
      cpu: { pct: Math.min(100, Math.round(util * 100)), cores: 1 },
      mem: { rssMb: Math.round(180 + this.players * 0.12), heapMb: Math.round(90 + this.players * 0.05) },
      loopLagMs: r1(Math.max(1, queueMs / 4 + util * 8)),
      particles,
    };
  }

  reset(): void {
    this.backlog = 0;
    this.window = [];
  }
}
