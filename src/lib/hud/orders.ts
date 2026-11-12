import { apiFetchAuthed } from '@/lib/api/client';
import type { Advice, Explanation, Tip } from './advice';

/**
 * Order Journey tracker data + its teaching layer (hover explanations and
 * the Advisor). Data: GET /api/admin/hud/orders (orders.read) and
 * GET /api/hud/store/funnel (Store Game viewer only).
 */

export type Stage = 'PENDING_PAYMENT' | 'PAID' | 'FULFILLING' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'REFUND_PROCESSING' | 'REFUNDED';

export interface Pipeline {
  days: number;
  stages: Array<{ stage: Stage; count: number; value: number; oldestHours: number }>;
  targets: Partial<Record<Stage, number>>;
  stuck: Array<{ orderNumber: string; stage: Stage; hoursInStage: number; targetHours: number; country: string; total: number; currency: string; method: string }>;
  stuckCount: number;
  abandoned: { count: number; value: number };
  deliveryByCountry: Array<{ country: string; delivered: number; medianHours: number }>;
  recent: Array<{ orderNumber: string; stage: Stage; hoursInStage: number; country: string; total: number; currency: string; placedAt: string }>;
}

export interface Funnel {
  steps: Array<{ step: string; visits: number }>;
  failed: number;
  errors: number;
  searched: number;
  stoppedAt: Array<{ step: string; visits: number }>;
  failReasons: Array<{ reason: string; count: number }>;
  errorsBy: Array<{ detail: string; count: number }>;
  platforms: Array<{ platform: string; steps: Array<{ step: string; visits: number }> }>;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function fetchPipeline(days: number): Promise<Pipeline> {
  return apiFetchAuthed<Pipeline>(`/api/admin/hud/orders?days=${days}`);
}

export async function fetchFunnel(days: number, token: string): Promise<Funnel | 'forbidden'> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  const r = await fetch(`${API}/api/hud/store/funnel?from=${from.toISOString()}&to=${to.toISOString()}&token=${encodeURIComponent(token)}`);
  if (r.status === 403) return 'forbidden';
  if (!r.ok) throw new Error(`Funnel failed (${r.status})`);
  return (await r.json()) as Funnel;
}

export const STAGE_LABEL: Record<Stage, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid · to pack',
  FULFILLING: 'Packing',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUND_PROCESSING: 'Refund processing',
  REFUNDED: 'Refunded',
};

export const STEP_LABEL: Record<string, string> = {
  enter: 'Visited',
  aisle: 'Browsed a category',
  shelf: 'Opened a product',
  cart_add: 'Added to basket',
  checkout: 'Started checkout',
  pay_ok: 'Paid',
};

export function naira(n: number, cur = 'NGN'): string {
  const sym = cur === 'USD' ? '$' : cur === 'GBP' ? '£' : '₦';
  return `${sym}${Math.round(n).toLocaleString()}`;
}

export function age(h: number): string {
  if (h < 1) return 'under 1 h';
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

// ---- explanations ------------------------------------------------------

export interface OrdersCtx {
  pipe: Pipeline | null;
  funnel: Funnel | null;
}

const stageNow =
  (stage: Stage) =>
  ({ pipe }: OrdersCtx) => {
    const s = pipe?.stages.find((x) => x.stage === stage);
    if (!s) return null;
    const target = pipe?.targets[stage];
    const late = pipe?.stuck.filter((x) => x.stage === stage).length ?? 0;
    return {
      text: `${s.count} order${s.count === 1 ? '' : 's'} (${naira(s.value)})${s.count ? ` · oldest ${age(s.oldestHours)}` : ''}${target ? ` · ${late} past the ${age(target)} target` : ''}.`,
      level: late ? ('bad' as const) : s.count ? ('good' as const) : ('info' as const),
    };
  };

export const ORDERS_EXPLAIN: Record<string, Explanation<OrdersCtx>> = {
  PENDING_PAYMENT: {
    title: 'Awaiting payment',
    what: 'The customer pressed “Place order” but the money never arrived. Usually they changed their mind, the card was declined, or they closed the payment page.',
    now: stageNow('PENDING_PAYMENT'),
    scale: 'Some is normal (window-shopping). If most checkouts end here, the payment step is losing sales.',
  },
  PAID: {
    title: 'Paid — waiting to be packed',
    what: 'The money is in. The next job is to pack the order and mark it “Packing” (Fulfilling) so the customer knows it’s moving.',
    now: stageNow('PAID'),
    scale: 'Target: packed within 24 hours of payment.',
  },
  FULFILLING: {
    title: 'Packing',
    what: 'Being packed / prepared. Next: hand it to the courier and mark it Shipped.',
    now: stageNow('FULFILLING'),
    scale: 'Target: shipped within 48 hours.',
  },
  SHIPPED: {
    title: 'Shipped',
    what: 'With the courier, on its way.',
    now: stageNow('SHIPPED'),
    scale: 'Target: delivered within 7 days.',
  },
  OUT_FOR_DELIVERY: {
    title: 'Out for delivery',
    what: 'With the rider for the last mile. The customer’s app shows a QR / code; the rider scans it and the order flips to Delivered.',
    now: stageNow('OUT_FOR_DELIVERY'),
    scale: 'Target: delivered within 48 hours.',
  },
  DELIVERED: {
    title: 'Delivered',
    what: 'In the customer’s hands. This triggers the review request and counts toward delivery times.',
    now: stageNow('DELIVERED'),
  },
  CANCELLED: { title: 'Cancelled', what: 'Stopped before it shipped — by the customer or by staff.', now: stageNow('CANCELLED') },
  REFUND_PROCESSING: {
    title: 'Refund processing',
    what: 'A full refund has started but the money hasn’t reached the customer yet — waiting on their bank details, or the card refund is in flight.',
    now: stageNow('REFUND_PROCESSING'),
    scale: 'Target: customer has the money within 3 days.',
  },
  REFUNDED: { title: 'Refunded', what: 'Money sent back to the customer — staff confirmed the transfer.', now: stageNow('REFUNDED') },
  stuck: {
    title: 'Stuck orders',
    what: 'Orders that have sat in one stage longer than they should. Each one is a customer waiting — fix the oldest first.',
    now: ({ pipe }) => (pipe ? { text: `${pipe.stuckCount} stuck right now.`, level: pipe.stuckCount ? 'bad' : 'good' } : null),
  },
  funnel: {
    title: 'Customer journey',
    what: 'Out of everyone who visited, how many got to each step. The biggest drop between two steps is where you’re losing the most customers.',
    now: ({ funnel }) => {
      if (!funnel) return null;
      const v = funnel.steps[0]?.visits ?? 0;
      const p = funnel.steps.find((s) => s.step === 'pay_ok')?.visits ?? 0;
      return { text: v ? `${p} of ${v} visits ended in a payment (${((p / v) * 100).toFixed(1)}%).` : 'No visits recorded yet.', level: 'info' };
    },
    scale: 'For online shops 1–3% of visits buying is typical; under 0.5% means something is putting people off.',
  },
  delivery: {
    title: 'Delivery time per country',
    what: 'Typical (median) time from payment to the customer receiving it, per destination country.',
    scale: 'Within Nigeria aim for under 3–5 days; international under 10–14.',
  },
};

// ---- advisors ------------------------------------------------------------

const STUCK_FIX: Partial<Record<Stage, string[]>> = {
  PAID: [
    'Open each order in Admin → Orders (search the order number), pack it and set the status to Fulfilling — the customer gets an update.',
    'If it was already sent or delivered outside the system, set the real status (Shipped / Delivered) so records, delivery times and review requests are right.',
    'If you can’t fulfil it, refund it (Admin → Orders → Refund) and message the customer — don’t leave a paying customer waiting.',
  ],
  FULFILLING: ['Hand packed orders to the courier and set them to Shipped (add the tracking number).', 'If something is out of stock, contact the customer and offer a swap or refund.'],
  SHIPPED: ['Chase the courier with the tracking number.', 'If the courier confirmed delivery, mark it Delivered (or use Show & Scan next time).'],
  OUT_FOR_DELIVERY: ['Call the rider; if the customer wasn’t home, rebook.', 'Ask the customer to show their delivery code to the rider.'],
  REFUND_PROCESSING: [
    'Check support@ for the customer’s bank details, send the transfer, then Admin → Orders → Refunds → Mark as sent (add the reference).',
    'No reply after 2 days? Call the customer on the order’s phone number.',
  ],
};

export function adviseOrders(pipe: Pipeline | null): Advice {
  if (!pipe) return { overall: 'green', headline: 'Loading orders…', tips: [] };
  const tips: Tip[] = [];
  const open = pipe.stages.filter((s) => ['PAID', 'FULFILLING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'REFUND_PROCESSING'].includes(s.stage)).reduce((a, s) => a + s.count, 0);

  for (const stage of ['PAID', 'FULFILLING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'REFUND_PROCESSING'] as Stage[]) {
    const late = pipe.stuck.filter((s) => s.stage === stage);
    if (!late.length) continue;
    const oldest = Math.max(...late.map((s) => s.hoursInStage));
    const value = late.reduce((a, s) => a + s.total, 0);
    tips.push({
      id: `stuck-${stage}`,
      severity: 'red',
      title: `${late.length} order${late.length === 1 ? '' : 's'} stuck at “${STAGE_LABEL[stage]}”`,
      happening: `${late.length} paying customer${late.length === 1 ? ' is' : 's are'} waiting (${naira(value)} in total). The oldest has been at this stage for ${age(oldest)} — the target is ${age(pipe.targets[stage] ?? 24)}.`,
      doThis: STUCK_FIX[stage] ?? [],
    });
  }

  const paid = pipe.stages.filter((s) => !['PENDING_PAYMENT', 'CANCELLED'].includes(s.stage)).reduce((a, s) => a + s.count, 0);
  const tried = paid + pipe.abandoned.count;
  if (pipe.abandoned.count >= 5 && tried && pipe.abandoned.count / tried >= 0.5) {
    tips.push({
      id: 'abandoned',
      severity: pipe.abandoned.count / tried >= 0.75 ? 'red' : 'yellow',
      title: `${pipe.abandoned.count} checkouts never got paid`,
      happening: `${Math.round((pipe.abandoned.count / tried) * 100)}% of orders placed in the last ${pipe.days} days were never paid — ${naira(pipe.abandoned.value)} of sales that nearly happened.`,
      doThis: [
        'Try it yourself: place a small order on the live site and pay — make sure the payment page loads and works on a phone.',
        'Check why payments fail in the Customer journey section below (gateway reasons like “card declined”).',
        'Make sure the abandoned-cart reminder email is going out (Resend dashboard) — a nudge recovers a share of these.',
        'Offer another way to pay (bank transfer / pay on delivery) if cards keep failing.',
      ],
    });
  }

  const delivered = pipe.stages.find((s) => s.stage === 'DELIVERED')?.count ?? 0;
  if (paid >= 3 && delivered === 0) {
    tips.push({
      id: 'never-delivered',
      severity: 'yellow',
      title: 'No order has been marked Delivered',
      happening: `In the last ${pipe.days} days ${paid} orders were paid but none is recorded as delivered — so there are no delivery times, and customers never get the “rate your order” request.`,
      doThis: [
        'Use Show & Scan: set orders Out for delivery; the rider scans the customer’s code and it flips to Delivered automatically.',
        'Or mark them Delivered in Admin → Orders once the customer has them.',
      ],
    });
  }

  for (const d of pipe.deliveryByCountry) {
    const slow = d.country === 'NG' ? d.medianHours > 5 * 24 : d.medianHours > 14 * 24;
    if (slow && d.delivered >= 3) {
      tips.push({
        id: `slow-${d.country}`,
        severity: 'yellow',
        title: `Deliveries to ${d.country} are slow`,
        happening: `Typical delivery to ${d.country} takes ${age(d.medianHours)} after payment.`,
        doThis: ['Check which stage takes longest (packing vs courier) on the board above.', 'Compare couriers for that route, or hold stock closer to those customers.'],
      });
    }
  }

  const order = { red: 0, yellow: 1, green: 2 };
  tips.sort((a, b) => order[a.severity] - order[b.severity]);
  const overall = tips.some((t) => t.severity === 'red') ? 'red' : tips.length ? 'yellow' : 'green';
  const lateCount = pipe.stuckCount;
  const pct = open ? Math.round((lateCount / open) * 100) : 0;
  return {
    overall,
    headline:
      overall === 'green'
        ? `All ${open} open order${open === 1 ? '' : 's'} are on time.`
        : lateCount
          ? `${lateCount} customer${lateCount === 1 ? ' is' : 's are'} waiting longer than they should.`
          : `${tips.length} thing${tips.length === 1 ? '' : 's'} to look at.`,
    meter: {
      label: 'Late orders',
      pct,
      left: `LATE · ${lateCount} of ${open} open orders are past their target`,
      right: `${pipe.abandoned.count} unpaid checkouts (${naira(pipe.abandoned.value)})`,
      explainKey: 'stuck',
    },
    tips,
  };
}

const DROP_FIX: Record<string, { title: string; fix: string[] }> = {
  aisle: {
    title: 'People leave the home page without browsing',
    fix: ['Check the home page loads fast on a phone (under 3 s).', 'Put the best-selling categories and a clear offer at the top.', 'Check the Search page for what people look for and feature it.'],
  },
  shelf: {
    title: 'People browse but don’t open products',
    fix: ['Product cards need clear photos and prices — products without good images get skipped.', 'Sort categories by best sellers, not newest.'],
  },
  cart_add: {
    title: 'People look at products but don’t add them',
    fix: ['Show the delivery cost and time on the product page — surprises kill sales.', 'Add reviews and more photos to the most-viewed products.', 'Check prices against competitors for the top viewed items.'],
  },
  checkout: {
    title: 'People add to basket but don’t check out',
    fix: ['Let people check out as a guest (no forced sign-up).', 'Show the full cost (shipping included) in the basket, not only at the end.'],
  },
  pay_ok: {
    title: 'People start checkout but don’t pay',
    fix: ['See “why payments failed” below and fix the top reason.', 'Test the payment page on a phone yourself.', 'Offer bank transfer / pay on delivery as a backup.'],
  },
};

export function adviseFunnel(f: Funnel | null): Advice {
  if (!f) return { overall: 'green', headline: 'Loading the customer journey…', tips: [] };
  const v = f.steps[0]?.visits ?? 0;
  if (!v) return { overall: 'green', headline: 'No visits recorded yet — tracking starts once the website and app updates are live.', tips: [] };
  const tips: Tip[] = [];
  // worst drop between consecutive steps (only once there's meaningful traffic)
  let worst: { step: string; keep: number; from: number; to: number } | null = null;
  for (let i = 1; i < f.steps.length; i++) {
    const a = f.steps[i - 1].visits;
    const b = f.steps[i].visits;
    if (a < 10) continue;
    const keep = b / a;
    if (!worst || keep < worst.keep) worst = { step: f.steps[i].step, keep, from: a, to: b };
  }
  if (worst && worst.keep < 0.4 && DROP_FIX[worst.step]) {
    const d = DROP_FIX[worst.step];
    tips.push({
      id: `drop-${worst.step}`,
      severity: worst.keep < 0.15 ? 'red' : 'yellow',
      title: d.title,
      happening: `This is the biggest drop: ${worst.from} visits reached “${STEP_LABEL[f.steps[f.steps.findIndex((s) => s.step === worst!.step) - 1].step]}” but only ${worst.to} went on to “${STEP_LABEL[worst.step]}” (${Math.round(worst.keep * 100)}%).`,
      doThis: d.fix,
    });
  }
  if (f.failed > 0) {
    const top = f.failReasons[0];
    tips.push({
      id: 'payfail',
      severity: f.failed >= 5 ? 'red' : 'yellow',
      title: `${f.failed} payment${f.failed === 1 ? '' : 's'} failed`,
      happening: top ? `Most common reason: “${top.reason}” (${top.count}×).` : 'The gateway didn’t say why.',
      doThis: [
        'If it’s “card declined / insufficient funds”, that’s the customer’s bank — offer bank transfer as a backup.',
        'If it’s timeouts or errors, check the gateway status (Squad / M-Pesa) and the Backend Arcade.',
        'Reach out to those customers — they wanted to buy.',
      ],
    });
  }
  if (f.errors > 0) {
    tips.push({
      id: 'errors',
      severity: f.errors >= 10 ? 'red' : 'yellow',
      title: `${f.errors} visit${f.errors === 1 ? '' : 's'} hit a server error`,
      happening: f.errorsBy[0] ? `Most often on ${f.errorsBy[0].detail} (${f.errorsBy[0].count}×).` : 'See the Backend Arcade.',
      doThis: ['Open the Backend Arcade → Advisor for the cause.', 'Send the failing route to the dev team with the time it happened.'],
    });
  }
  const paidN = f.steps.find((s) => s.step === 'pay_ok')?.visits ?? 0;
  const conv = (paidN / v) * 100;
  const order = { red: 0, yellow: 1, green: 2 };
  tips.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    overall: tips.some((t) => t.severity === 'red') ? 'red' : tips.length ? 'yellow' : 'green',
    headline: `${conv.toFixed(1)}% of visits ended in a payment (${paidN} of ${v}).`,
    meter: {
      label: 'Conversion',
      pct: Math.min(100, conv * 20), // 5% conversion fills the bar
      left: `CONVERSION · ${conv.toFixed(2)}% of visits paid`,
      right: 'typical online shop: 1–3%',
      explainKey: 'funnel',
      goodWhen: 'high',
    },
    tips,
  };
}
