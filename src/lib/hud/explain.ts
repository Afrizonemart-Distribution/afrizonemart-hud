import type { PulseParticle, PulseSnapshot } from './pulseTypes';
import type { Explanation as Ex, Level } from './advice';

export type { Level };
export type Explanation = Ex<PulseSnapshot>;

/**
 * Plain-English explanations for everything on the Backend Arcade. Each
 * entry says what the thing is, what it's doing right now (live numbers)
 * and what "good / watch / bad" look like. Written for a non-engineer.
 */


const lvl = (v: number, watch: number, bad: number): Level => (v >= bad ? 'bad' : v >= watch ? 'watch' : 'good');

export const EXPLAIN: Record<string, Explanation> = {
  shoppers: {
    title: 'Shoppers',
    what: 'People using the website or app right now. In a load test these are k6 “virtual shoppers” — robots that click around like real customers.',
    now: (s) => {
      const n = s.players.loadtest || s.players.shoppers;
      return { text: `${n.toLocaleString()} ${s.players.loadtest ? 'virtual shoppers (load test)' : 'real shoppers in the last minute'}.`, level: 'info' };
    },
    scale: 'More shoppers = more work for the server. That’s fine until the other numbers turn yellow or red.',
  },
  cache: {
    title: 'Cache shield (the blue arc)',
    what: 'A 1-second memory of recent answers. If 50 people ask for the same product page in the same second, the server works it out once and hands the other 49 the saved copy — no trip to the database.',
    now: (s) =>
      s.cache.ttlMs
        ? { text: `${s.cache.hitRate}% of eligible requests answered from memory.`, level: s.cache.hitRate >= 50 ? 'good' : s.cache.hitRate >= 25 ? 'watch' : 'bad' }
        : { text: 'Cache is OFF — every request goes to the database.', level: 'watch' },
    scale: 'Good: above 50%. Low is normal when traffic is quiet (nothing to share yet).',
  },
  node: {
    title: 'Node.js API (the boss)',
    what: 'The program that answers every request from the website and app. Its health bar is spare brain-power (CPU). When it runs out, everyone waits in a queue.',
    now: (s) => ({
      text: `Using ${s.cpu.pct}% of its CPU · ${s.inflight} request${s.inflight === 1 ? '' : 's'} being worked on right now.`,
      level: lvl(s.cpu.pct, 65, 85),
    }),
    scale: 'Good: under 65% CPU. Watch: 65–85%. Bad: over 85% — it shakes and requests start queueing.',
  },
  postgres: {
    title: 'Postgres (the database)',
    what: 'Where everything is stored — products, orders, customers. The API asks it questions (“queries”). Each query should take a few milliseconds.',
    now: (s) => ({
      text: `${s.db.qps} questions per second, averaging ${s.db.avgMs} ms each · ${s.db.inflight} waiting right now.`,
      level: s.db.avgMs >= 50 || s.db.inflight >= 8 ? 'bad' : s.db.avgMs >= 15 || s.db.inflight >= 5 ? 'watch' : 'good',
    }),
    scale: 'Good: under 15 ms per question. Over 50 ms means slow questions or a database that needs a bigger plan.',
  },
  dots: {
    title: 'The moving dots',
    what: 'Each dot is one real request (a page, a search, an add-to-cart). It runs the route it really took: bounces off the blue shield if the cache answered, otherwise goes all the way to Postgres and back.',
    scale: 'Green: under 100 ms (feels instant). Amber: 100–500 ms (OK). Red: over 500 ms (feels slow) or 💥 failed.',
  },
  rps: {
    title: 'Throughput (requests per second)',
    what: 'How many requests the server finished in the last second. Each shopper makes roughly one request every 10 seconds while browsing.',
    now: (s) => ({ text: `${s.rps} requests/second ≈ ${Math.round(s.rps / 0.093).toLocaleString()} shoppers’ worth of browsing.`, level: 'info' }),
  },
  p50: {
    title: 'p50 — the typical response',
    what: 'Half of all requests were faster than this. It’s what a normal customer feels.',
    now: (s) => ({ text: `${s.lat.p50} ms`, level: lvl(s.lat.p50, 150, 400) }),
    scale: 'Good: under 150 ms. Over 400 ms everyone notices.',
  },
  p95: {
    title: 'p95 — the slow 1-in-20',
    what: '95% of requests were faster than this; 1 in 20 customers waited this long or longer. It’s the number load tests are judged on — it rises first when the server is getting full.',
    now: (s) => ({ text: `${s.lat.p95} ms (limit 500 ms)`, level: lvl(s.lat.p95, 250, 500) }),
    scale: 'Good: under 250 ms. Watch: 250–500. Bad: over 500 ms — the test FAILS.',
  },
  p99: {
    title: 'p99 — the unlucky 1-in-100',
    what: 'The slowest 1% of requests. Spikes here are the first sign of trouble even when the average looks fine.',
    now: (s) => ({ text: `${s.lat.p99} ms (limit 1,000 ms)`, level: lvl(s.lat.p99, 500, 1000) }),
    scale: 'Good: under 500 ms. Bad: over 1 second.',
  },
  errors: {
    title: 'Errors',
    what: 'Requests that failed with a server error (a 5xx). The customer saw an error message or a blank section.',
    now: (s) => ({ text: `${s.errors.rate}% of requests failed (${s.errors.s5xx} in the last 5 s).`, level: s.errors.rate >= 1 ? 'bad' : s.errors.rate > 0 ? 'watch' : 'good' }),
    scale: 'Good: 0%. Bad: 1% or more — 1 in 100 customers hit an error.',
  },
  cpu: {
    title: 'CPU',
    what: 'How busy the server’s processor is. Node.js uses one core for answering requests, so 100% means it can’t go any faster.',
    now: (s) => ({ text: `${s.cpu.pct}% busy · event-loop delay ${s.loopLagMs} ms.`, level: lvl(s.cpu.pct, 65, 85) }),
    scale: 'Good: under 65%. Over 85% requests start waiting in line.',
  },
  loop: {
    title: 'Event-loop delay',
    what: 'Node.js does one thing at a time very quickly. This is how long a new request had to wait before Node could even start on it.',
    now: (s) => ({ text: `${s.loopLagMs} ms`, level: lvl(s.loopLagMs, 40, 100) }),
    scale: 'Good: under 40 ms. Over 100 ms means something is hogging Node (a huge response, heavy calculation).',
  },
  cachehit: {
    title: 'Cache hit rate',
    what: 'Of the requests that are allowed to use the cache (product lists, product pages, categories, shelves, site text, autocomplete), how many were answered from memory.',
    now: (s) => ({ text: s.cache.ttlMs ? `${s.cache.hitRate}% · ${s.cache.hit + s.cache.shared} saved trips to the database in the last half-second` : 'Cache is OFF', level: s.cache.ttlMs ? (s.cache.hitRate >= 50 ? 'good' : 'watch') : 'watch' }),
  },
  passfail: {
    title: 'PASS / FAIL',
    what: 'The same rule as the k6 video: the server “passes” while 95% of requests are under 500 ms, 99% under 1 second, and fewer than 1% fail.',
    now: (s) => {
      const ok = s.lat.p95 < 500 && s.lat.p99 < 1000 && s.errors.rate < 1;
      return { text: ok ? 'Passing right now.' : 'Failing right now — see the Advisor for why and what to do.', level: ok ? 'good' : 'bad' };
    },
  },
  chart: {
    title: 'Last 60 seconds',
    what: 'Orange line = p95 (the slow 1-in-20). Green = p50 (typical). Blue = requests per second. The red dashed line is the 500 ms limit — when orange crosses it, the server is overloaded.',
  },
  experiment: {
    title: 'The experiment',
    what: 'Recreates the k6 video: add shoppers in steps (10 → 3,000), record whether each step PASSES, then turn the 1-second cache on and repeat. The bar chart shows how many more shoppers the same server handles with the cache.',
  },
  source: {
    title: 'Where the numbers come from',
    what: 'LIVE = your real API right now. STAGING = a copy of the API under a k6 load test. SIM = a practice model (not real) — use it to learn what happens as traffic grows.',
  },
  capacity: {
    title: 'Capacity',
    what: 'An estimate of how many shoppers can be on the site at the same time before it starts to feel slow, based on how much CPU each request is costing right now.',
    scale: 'Keep current traffic under ~75% of capacity so a sudden rush (a promo, a viral post) doesn’t tip it over.',
  },
};

const GROUP_NAME: Record<string, string> = {
  browse: 'Product lists',
  product: 'Product page',
  search: 'Search',
  recs: 'Recommendations',
  catalog: 'Categories & site text',
  cart: 'Cart',
  checkout: 'Checkout & payment',
  auth: 'Sign-in',
  admin: 'Admin',
  other: 'Other',
};

export function groupName(g: string): string {
  return GROUP_NAME[g] ?? g;
}

/** Explanation for one dot (one request). */
export function explainParticle(p: PulseParticle): Explanation {
  const route =
    p.c === 'hit' || p.c === 'shared'
      ? 'answered from the 1-second cache — never touched the database'
      : p.db > 0
        ? `went to the database (${p.db} question${p.db === 1 ? '' : 's'})`
        : 'answered by Node without the database';
  const feel = p.s >= 500 ? 'FAILED — the customer saw an error' : p.ms < 100 ? 'felt instant' : p.ms < 500 ? 'was OK' : 'felt slow';
  return {
    title: `One request · ${groupName(p.g)}`,
    what: `Took ${p.ms} ms and ${route}. To the customer it ${feel}.`,
  };
}
