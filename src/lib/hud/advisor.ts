import { groupName } from './explain';
import type { PulseSnapshot } from './pulseTypes';

/**
 * The Advisor: reads the live numbers and says, in plain English, what's
 * wrong and what to do about it — cheapest fix first. Also estimates how
 * many shoppers the API can hold at once before it slows down.
 *
 * Fixes are specific to Afrizonemart's stack: one Node API on Railway,
 * Postgres on Railway, Prisma, the 1-second micro-cache
 * (MICRO_CACHE_TTL_MS), Vercel in front of the website.
 */

export type Severity = 'red' | 'yellow' | 'green';

export interface Tip {
  id: string;
  severity: Severity;
  title: string;
  happening: string;
  doThis: string[];
}

export interface Advice {
  overall: Severity;
  headline: string;
  capacity: { now: number; max: number | null; pct: number | null; bottleneck: string };
  tips: Tip[];
}

const REQ_PER_SHOPPER = 0.093; // the k6 video's ratio: 232 req/s at 2,500 shoppers
const CPU_TARGET = 0.8; // plan to stay under 80% of one core

function avg(h: PulseSnapshot[], f: (s: PulseSnapshot) => number): number {
  if (!h.length) return 0;
  return h.reduce((a, s) => a + f(s), 0) / h.length;
}

export function advise(snap: PulseSnapshot | null, history: PulseSnapshot[], mode: 'live' | 'staging' | 'sim'): Advice {
  if (!snap) {
    return {
      overall: 'green',
      headline: 'Waiting for numbers…',
      capacity: { now: 0, max: null, pct: null, bottleneck: '—' },
      tips: [],
    };
  }
  // Smooth over the last ~5 s so one spike doesn't flip the advice.
  const h = history.slice(-10);
  const cpu = avg(h, (s) => s.cpu.pct);
  const p95 = avg(h, (s) => s.lat.p95);
  const p99 = avg(h, (s) => s.lat.p99);
  const err = avg(h, (s) => s.errors.rate);
  const lag = avg(h, (s) => s.loopLagMs);
  const dbMs = avg(h, (s) => s.db.avgMs);
  const dbWait = avg(h, (s) => s.db.inflight);
  const rps = avg(h, (s) => s.rps);
  const rss = snap.mem.rssMb;
  const players = snap.players.loadtest || snap.players.shoppers;

  // Capacity: requests/sec one core can sustain at the CPU target, from what each request costs now.
  let max: number | null = null;
  if (cpu >= 3 && rps >= 0.5) max = Math.round(((rps / (cpu / 100)) * CPU_TARGET) / REQ_PER_SHOPPER);
  const nowShoppers = players || Math.round(rps / REQ_PER_SHOPPER);
  const pct = max ? Math.round((nowShoppers / max) * 100) : null;

  const tips: Tip[] = [];
  const env = mode === 'staging' ? 'the loadtest environment' : 'production';

  // Which part of the site is slowest right now?
  const slow = [...snap.groups].filter((g) => g.rps >= 0.2).sort((a, b) => b.p95 - a.p95)[0];

  // -- CPU ---------------------------------------------------------------
  if (cpu >= 85 || (cpu >= 65 && p95 >= 250)) {
    tips.push({
      id: 'cpu',
      severity: cpu >= 85 ? 'red' : 'yellow',
      title: cpu >= 85 ? 'The API server is out of breath' : 'The API server is getting busy',
      happening: `It’s using ${Math.round(cpu)}% of its processor. Past ~85%, requests start queueing and every page gets slower for everyone.`,
      doThis: [
        snap.cache.ttlMs
          ? `Cheapest: let the cache remember answers longer — on Railway → api → Variables, set MICRO_CACHE_TTL_MS=3000 (3 s instead of 1 s). Catalog pages can be 3 s old without anyone noticing.`
          : 'Cheapest: turn the cache back on — on Railway → api → Variables, set MICRO_CACHE_TTL_MS=1000.',
        slow ? `Find the heavy part: “${groupName(slow.g)}” is the slowest right now (p95 ${Math.round(slow.p95)} ms). Ask for it to be cached or optimised.` : 'Find the heavy part in the “slowest area” row below.',
        `If it stays red: give the API more power — Railway → api → Settings → Resources: raise vCPU, or set Replicas to 2 (two copies share the load).`,
      ],
    });
  }

  // -- Latency (why is it slow?) -------------------------------------------
  if (p95 >= 250 || p99 >= 500) {
    const cause =
      cpu >= 65
        ? 'the server is busy (see above)'
        : dbMs >= 15 || dbWait >= 5
          ? 'the database is slow to answer'
          : lag >= 40
            ? 'something is hogging Node for long stretches'
            : 'something outside the server (a payment gateway, an image host, the network)';
    tips.push({
      id: 'latency',
      severity: p95 >= 500 || p99 >= 1000 ? 'red' : 'yellow',
      title: p95 >= 500 ? 'Customers are waiting too long' : 'Pages are getting slower',
      happening: `1 in 20 requests takes ${Math.round(p95)} ms or more (limit 500 ms); 1 in 100 takes ${Math.round(p99)} ms. Most likely cause: ${cause}.`,
      doThis:
        cpu >= 65
          ? ['Fix the CPU tip first — slow pages here are a side effect of a busy server.']
          : dbMs >= 15 || dbWait >= 5
            ? ['Follow the database tip below.']
            : lag >= 40
              ? ['Follow the “Node is blocked” tip below.']
              : [
                  slow ? `Check “${groupName(slow.g)}” — it’s the slowest area (p95 ${Math.round(slow.p95)} ms).` : 'Check which area is slowest in the row below.',
                  'If it’s Checkout & payment, the wait is usually the payment gateway (Squad / M-Pesa), not us — check their status page.',
                ],
    });
  }

  // -- Database ------------------------------------------------------------
  if (dbMs >= 15 || dbWait >= 5) {
    tips.push({
      id: 'db',
      severity: dbMs >= 50 || dbWait >= 8 ? 'red' : 'yellow',
      title: dbWait >= 5 ? 'Requests are queueing for the database' : 'The database is answering slowly',
      happening:
        dbWait >= 5
          ? `${Math.round(dbWait)} questions are waiting for a free database connection. The API only keeps a handful of connections open, so extra questions wait in line.`
          : `Each database question takes ${Math.round(dbMs)} ms on average (should be under 15 ms). Usually one slow query is missing an index.`,
      doThis:
        dbWait >= 5
          ? [
              'Allow more connections: add ?connection_limit=20 to the API’s DATABASE_URL on Railway (default is about 2× the CPU cores + 1).',
              'If the database itself is maxed out: Railway → Postgres → Settings → Resources: more vCPU/RAM.',
              'At much bigger scale: add PgBouncer (a connection pooler) in front of Postgres.',
            ]
          : [
              'Find the slow query: ask the dev team, or if the pg_stat_statements extension is enabled run SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;',
              'Usual fix: add an index on the column that query filters by — minutes of work, often 10–100× faster.',
              'If every query is slow, the database needs more RAM: Railway → Postgres → Resources.',
            ],
    });
  }

  // -- Event loop ------------------------------------------------------------
  if (lag >= 40) {
    tips.push({
      id: 'loop',
      severity: lag >= 100 ? 'red' : 'yellow',
      title: 'Node is blocked doing big jobs in one go',
      happening: `New requests wait ${Math.round(lag)} ms before Node can even start on them. Something is doing heavy work in a single stretch — building a huge response, resizing an image, a big loop.`,
      doThis: [
        slow ? `Look at “${groupName(slow.g)}” first — it’s the slowest area.` : 'Look at the slowest area first.',
        'Send less at once: paginate big lists (24 items, not 500).',
        'Move heavy work (CSV imports, image work, reports) to a background job instead of doing it while a customer waits.',
      ],
    });
  }

  // -- Errors -------------------------------------------------------------------
  if (err > 0) {
    tips.push({
      id: 'errors',
      severity: err >= 1 ? 'red' : 'yellow',
      title: err >= 1 ? 'Customers are seeing errors' : 'A few requests are failing',
      happening: `${err.toFixed(1)}% of requests failed with a server error.${cpu >= 85 || dbWait >= 8 ? ' This often happens when the server or database is overloaded — fix those first.' : ''}`,
      doThis: [
        `See exactly what broke: railway logs --service api (${env}), or the error list in Sentry.`,
        'If errors only appear under heavy load, they’re timeouts — the CPU / database fixes above will stop them.',
        'If they appear even when quiet, it’s a bug — send the error message to the dev team.',
      ],
    });
  }

  // -- Memory ------------------------------------------------------------------
  if (rss >= 700) {
    tips.push({
      id: 'memory',
      severity: rss >= 1000 ? 'red' : 'yellow',
      title: 'The API is using a lot of memory',
      happening: `It’s holding ${rss} MB. If it runs out, Railway restarts it and everyone gets errors for a few seconds.`,
      doThis: [
        'If it keeps growing and never comes down, it’s a memory leak — tell the dev team (and note when it started).',
        'Short-term: Railway → api → Settings → Resources: more RAM.',
      ],
    });
  }

  // -- Cache effectiveness ---------------------------------------------------------
  if (!snap.cache.ttlMs && rps >= 5) {
    tips.push({
      id: 'cache-off',
      severity: 'yellow',
      title: 'The cache is switched off',
      happening: 'Every product page and list goes to the database, even when hundreds of people ask for the same one each second.',
      doThis: ['Railway → api → Variables: set MICRO_CACHE_TTL_MS=1000 (or remove it — 1000 is the default).'],
    });
  } else if (snap.cache.ttlMs && rps >= 20 && avg(h, (s) => s.cache.hitRate) < 30) {
    tips.push({
      id: 'cache-low',
      severity: 'yellow',
      title: 'The cache isn’t catching much',
      happening: `Only ${Math.round(avg(h, (s) => s.cache.hitRate))}% of catalog requests are answered from memory — shoppers are spread over many different products, so 1 second isn’t long enough for repeats.`,
      doThis: [
        'Raise MICRO_CACHE_TTL_MS to 3000–5000 on Railway (catalog data a few seconds old is fine).',
        'Bigger win later: put the website’s product pages behind Vercel’s cache so most visits never reach the API.',
      ],
    });
  }

  // -- Capacity headroom ---------------------------------------------------------------
  if (pct !== null && pct >= 75 && !tips.some((t) => t.id === 'cpu')) {
    tips.push({
      id: 'headroom',
      severity: pct >= 90 ? 'red' : 'yellow',
      title: 'Close to the limit',
      happening: `You’re at about ${pct}% of what this server can handle (${nowShoppers.toLocaleString()} of ~${max!.toLocaleString()} shoppers). A promo or viral post could tip it over.`,
      doThis: [
        'Before a campaign: raise MICRO_CACHE_TTL_MS to 3000, and set Replicas to 2 on Railway for the day.',
        'Run a k6 load test on the loadtest environment to confirm the new limit.',
      ],
    });
  }

  // A slowdown caused by something else points at that card ("fix the CPU
  // tip first"), so the cause must be at least as severe and listed first.
  const lat = tips.find((t) => t.id === 'latency');
  if (lat?.severity === 'red') {
    const causeId = cpu >= 65 ? 'cpu' : dbMs >= 15 || dbWait >= 5 ? 'db' : lag >= 40 ? 'loop' : null;
    const cause = tips.find((t) => t.id === causeId);
    if (cause) {
      cause.severity = 'red';
      if (cause.id === 'cpu') cause.title = 'The API server is out of breath';
    }
  }
  const order: Record<Severity, number> = { red: 0, yellow: 1, green: 2 };
  tips.sort((a, b) => order[a.severity] - order[b.severity]);
  const overall: Severity = tips.some((t) => t.severity === 'red') ? 'red' : tips.length ? 'yellow' : 'green';

  const bottleneck =
    cpu >= 65 ? 'API processor (CPU)' : dbMs >= 15 || dbWait >= 5 ? 'Database' : lag >= 40 ? 'Node event loop' : rps < 0.5 ? 'not enough traffic to tell' : 'nothing yet — all healthy';

  const headline =
    overall === 'green'
      ? max
        ? `Healthy. This server can take about ${max.toLocaleString()} shoppers at once before slowing down.`
        : 'Healthy. Not enough traffic yet to estimate the limit — try SIM or a load test.'
      : overall === 'yellow'
        ? `Working, but ${tips.length} thing${tips.length === 1 ? '' : 's'} to keep an eye on.`
        : `Action needed: ${tips.filter((t) => t.severity === 'red').length} problem${tips.filter((t) => t.severity === 'red').length === 1 ? '' : 's'} hurting customers now.`;

  return { overall, headline, capacity: { now: nowShoppers, max, pct, bottleneck }, tips };
}
