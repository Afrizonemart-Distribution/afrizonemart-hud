/**
 * Mirror of PulseSnapshot in afrizonemart-api src/modules/hud/pulse.ts —
 * one frame of GET /api/hud/pulse, sent every 500 ms.
 */
export type PulseGroup =
  | 'browse'
  | 'product'
  | 'search'
  | 'recs'
  | 'catalog'
  | 'cart'
  | 'checkout'
  | 'auth'
  | 'admin'
  | 'other';

export type CacheOutcome = 'hit' | 'shared' | 'miss';

export interface PulseParticle {
  g: PulseGroup;
  ms: number;
  s: number;
  c?: CacheOutcome;
  db: number;
}

export interface PulseSnapshot {
  t: number;
  rps: number;
  inflight: number;
  players: { loadtest: number; shoppers: number };
  lat: { p50: number; p95: number; p99: number; max: number };
  errors: { rate: number; s5xx: number; s4xx: number };
  groups: Array<{ g: PulseGroup; rps: number; p95: number }>;
  cache: { hit: number; shared: number; miss: number; hitRate: number; ttlMs: number };
  db: { qps: number; avgMs: number; inflight: number };
  cpu: { pct: number; cores: number };
  mem: { rssMb: number; heapMb: number };
  loopLagMs: number;
  particles: PulseParticle[];
}

/** The video's pass line: p95 under 500 ms, p99 under 1 s, errors under 1%. */
export const LIMITS = { p95: 500, p99: 1000, errorPct: 1 } as const;

export function passes(s: Pick<PulseSnapshot, 'lat' | 'errors'>): boolean {
  return s.lat.p95 < LIMITS.p95 && s.lat.p99 < LIMITS.p99 && s.errors.rate < LIMITS.errorPct;
}
