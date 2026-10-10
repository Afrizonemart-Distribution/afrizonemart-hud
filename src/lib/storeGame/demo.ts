import type { CategoryNode, StoreEvent } from './types';

/**
 * DEMO shoppers — invented visits using the real category tree and real
 * product names, so the store can be seen before live data exists. The
 * page labels DEMO mode loudly; nothing here is a real customer.
 *
 * Each visit: walk in → 1–3 aisles, looking at shelves (sometimes a
 * search) → maybe add to basket → ~35% check out → ~85% of those pay,
 * the rest fail → walk out. ~3% hit an error somewhere.
 */

const COUNTRIES = ['NG', 'NG', 'NG', 'GH', 'KE', 'ZA', 'GB', 'US', 'CA', 'RW', 'MW'];
const PLATFORMS = ['web', 'android', 'android', 'ios'];
const SEARCHES = ['garri', 'shea butter', 'palm oil', 'jollof spice', 'ankara', 'chin chin', 'zobo', 'kente', 'plantain chips', 'egusi'];
const FAIL_REASONS = ['card declined', 'insufficient funds', 'bank timeout', 'OTP not entered'];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export function startDemo(
  categories: CategoryNode[],
  products: Array<{ slug: string; category?: { slug: string } | null }>,
  emit: (e: StoreEvent) => void,
  shoppersPerMinute = 14,
): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const leaves = categories.flatMap((c) => [c.slug, ...(c.children ?? []).map((k) => k.slug)]);

  const visit = () => {
    const s = `demo${Math.random().toString(36).slice(2, 10)}`;
    const base = { s, p: pick(PLATFORMS), c: pick(COUNTRIES) };
    const ev = (e: Omit<StoreEvent, 's' | 'p' | 'c' | 'at'>) => emit({ ...base, ...e, at: Date.now() });
    let t = 0;
    const at = (ms: number, fn: () => void) => later((t += ms), fn);

    at(0, () => ev({ t: 'enter' }));
    let carted = 0;
    const aisles = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < aisles; i++) {
      const prod = products.length ? pick(products) : null;
      if (Math.random() < 0.25) at(4000, () => ev({ t: 'search', q: pick(SEARCHES) }));
      const cat = prod?.category?.slug ?? pick(leaves);
      at(3500 + Math.random() * 3000, () => ev({ t: 'aisle', cat }));
      if (prod) {
        at(4000 + Math.random() * 4000, () => ev({ t: 'shelf', prod: prod.slug }));
        if (Math.random() < 0.45) {
          carted++;
          at(2500, () => ev({ t: 'cart_add', prod: prod.slug }));
        }
      }
      if (Math.random() < 0.03) at(1500, () => ev({ t: 'error', d: '500 GET /api/products/:slug' }));
    }
    if (carted && Math.random() < 0.8) {
      const amt = 2000 + Math.round(Math.random() * 40) * 750;
      at(5000, () => ev({ t: 'checkout', amt, cur: 'NGN' }));
      if (Math.random() < 0.85) at(7000, () => ev({ t: 'pay_ok', amt, cur: 'NGN', d: 'squad' }));
      else {
        at(7000, () => ev({ t: 'pay_fail', amt, cur: 'NGN', d: `squad: ${pick(FAIL_REASONS)}` }));
        at(6000, () => ev({ t: 'leave' }));
      }
    } else {
      at(5000, () => ev({ t: 'leave' }));
    }
  };

  // A few already inside, then a steady stream.
  for (let i = 0; i < 6; i++) later(i * 700, visit);
  const tick = () => {
    visit();
    later((60_000 / shoppersPerMinute) * (0.5 + Math.random()), tick);
  };
  later(5000, tick);

  return () => {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  };
}
