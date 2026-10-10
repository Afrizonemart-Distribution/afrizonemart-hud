import type { StoreEvent } from '../storeGame/types';

/**
 * Running totals for the game HUD and the city's signs: today's visits,
 * sales, failed payments, errors, arrivals per country, what people
 * search for and which shops are busiest. Fed every event (including
 * old ones used only to seed the day), never rendered directly.
 */
export class Ledger {
  visits = new Set<string>();
  sales = 0; // NGN-ish sum of pay_ok amounts (mixed currencies shown as-is)
  paid = 0;
  failed = 0;
  errors = 0;
  checkouts = 0;
  biggest = 0;
  byCountry = new Map<string, number>();
  searches = new Map<string, number>();
  shops = new Map<string, number>();
  lastFail: { reason: string; at: number } | null = null;
  lastError: { detail: string; at: number } | null = null;
  recent: StoreEvent[] = [];

  tally(e: StoreEvent): void {
    if (e.t === 'enter' && !this.visits.has(e.s)) {
      this.visits.add(e.s);
      const c = (e.c ?? '??').toUpperCase();
      this.byCountry.set(c, (this.byCountry.get(c) ?? 0) + 1);
    }
    if (e.t === 'pay_ok') {
      this.paid++;
      this.sales += e.amt ?? 0;
      this.biggest = Math.max(this.biggest, e.amt ?? 0);
    }
    if (e.t === 'pay_fail') {
      this.failed++;
      this.lastFail = { reason: e.d ?? 'unknown reason', at: e.at };
    }
    if (e.t === 'error') {
      this.errors++;
      this.lastError = { detail: e.d ?? '', at: e.at };
    }
    if (e.t === 'checkout') this.checkouts++;
    if (e.t === 'search' && e.q) {
      const q = e.q.trim().toLowerCase();
      this.searches.set(q, (this.searches.get(q) ?? 0) + 1);
    }
    if ((e.t === 'aisle' || e.t === 'shelf') && e.cat) this.shops.set(e.cat, (this.shops.get(e.cat) ?? 0) + 1);
    this.recent.push(e);
    if (this.recent.length > 40) this.recent.splice(0, this.recent.length - 40);
  }

  top<K>(m: Map<K, number>, n: number): Array<[K, number]> {
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  reset(): void {
    this.visits.clear();
    this.sales = this.paid = this.failed = this.errors = this.checkouts = this.biggest = 0;
    this.byCountry.clear();
    this.searches.clear();
    this.shops.clear();
    this.lastFail = this.lastError = null;
    this.recent = [];
  }
}
