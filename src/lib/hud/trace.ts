import { apiFetchAuthed } from '@/lib/api/client';
import type { Advice, Explanation, Tip } from './advice';

/**
 * Traceability page data + teaching layer. Data: GET /api/admin/trace/overview
 * and /producers (trace.manage — afrizonemart-api src/modules/trace).
 */

export type CheckKey = 'identity' | 'audit' | 'stage' | 'active' | 'registered';

export interface TraceEvent {
  eventId: string;
  seq: number;
  subjectType: 'PRODUCER' | 'SKU';
  subjectLabel: string;
  eventType: string;
  ts: string;
  hash: string;
}

export interface TraceOverview {
  producers: {
    total: number;
    verified: number;
    oneStepAway: number;
    blockers: Partial<Record<CheckKey, number>>;
    checkPass: Partial<Record<CheckKey, number>>;
    byCountry: Record<string, { total: number; verified: number }>;
  };
  products: { linked: number; approvedPiqs: number };
  stories: { published: number };
  events: { last24h: number; total: number; recent: TraceEvent[] };
  inbox: { pending: number; deadLettered: number; lastReceivedAt: string | null };
}

export interface TraceProducer {
  id: string;
  supplierId: string;
  name: string;
  country: string | null;
  stage: number;
  verified: boolean;
  missing: number;
  checks: { key: CheckKey; label: string; ok: boolean; detail: string }[];
  linkedProducts: number;
  hasStory: boolean;
}

export const fetchTraceOverview = () => apiFetchAuthed<TraceOverview>('/api/admin/trace/overview');
export const fetchTraceProducers = () => apiFetchAuthed<{ items: TraceProducer[] }>('/api/admin/trace/producers?filter=all');

export const ADMIN_TRACE = 'https://afrizonemart.com/admin/trace';
export const SUPPLIER_PORTAL = 'https://suppliers.afrizonemart.com/admin';

export const CHECK_ORDER: CheckKey[] = ['identity', 'registered', 'audit', 'stage', 'active'];

export const CHECK_LABEL: Record<CheckKey, string> = {
  identity: 'Identity checked',
  registered: 'CAC + TIN on file',
  audit: 'Facility audit passed',
  stage: 'Reached Activation (stage 8)',
  active: 'Account active',
};

export const EVENT_LABEL: Record<string, string> = {
  PRODUCER_REGISTERED: 'Producer added',
  PRODUCER_VERIFIED: 'Became Verified',
  PRODUCER_REVOKED: 'Lost Verified',
  PRODUCER_STORY_PUBLISHED: 'Story published',
  SKU_LINKED: 'Product linked to maker',
  SKU_UNLINKED: 'Product unlinked',
};

// ---- explanations ------------------------------------------------------

export interface TraceCtx {
  o: TraceOverview | null;
}

const pass =
  (k: CheckKey) =>
  ({ o }: TraceCtx) =>
    o
      ? {
          text: `${o.producers.checkPass[k] ?? 0} of ${o.producers.total} producers pass this.`,
          level: (o.producers.checkPass[k] ?? 0) === 0 ? ('bad' as const) : ('info' as const),
        }
      : null;

export const TRACE_EXPLAIN: Record<string, Explanation<TraceCtx>> = {
  verified: {
    title: 'Verified Producers',
    what: 'Producers who passed every check in the supplier portal: identity (KYC), a facility audit with outcome APPROVED, business registration, reached Activation & Listing, and not suspended. Their products show a “Verified Producer” badge. Nobody can tick it by hand — it switches on and off by itself as the portal changes.',
    now: ({ o }) =>
      o ? { text: `${o.producers.verified} of ${o.producers.total} producers are verified.`, level: o.producers.verified ? 'good' : 'bad' } : null,
    scale: 'Early on a handful is fine. What matters is that the number grows as audits pass.',
  },
  close: {
    title: 'One step away',
    what: 'Producers who pass every check but one. The quickest wins — one desk can turn each of them Verified.',
    now: ({ o }) => (o ? { text: `${o.producers.oneStepAway} producer(s) are one step away.`, level: o.producers.oneStepAway ? 'watch' : 'info' } : null),
  },
  linked: {
    title: 'Products linked to their maker',
    what: 'Marketplace products staff have matched to the portal producer who makes them. Only linked products can show “Meet the Maker” with the producer’s own story.',
    now: ({ o }) =>
      o ? { text: `${o.products.linked} linked; the portal has ${o.products.approvedPiqs} approved products.`, level: o.products.linked ? 'info' : 'watch' } : null,
  },
  stories: {
    title: 'Published stories',
    what: 'Producers whose “Our story” was approved by staff in the supplier portal. The story appears under Meet the Maker on every linked product.',
    now: ({ o }) => (o ? { text: `${o.stories.published} published.`, level: o.stories.published ? 'good' : 'watch' } : null),
  },
  ledger: {
    title: 'The ledger',
    what: 'Every traceability event, written once and never edited. Each one carries a fingerprint (hash) of the one before it, so changing any old record breaks every fingerprint after it — and the integrity check in Admin → Traceability would show it.',
    now: ({ o }) => (o ? { text: `${o.events.total} events, ${o.events.last24h} in the last 24 h.`, level: 'info' } : null),
  },
  inbox: {
    title: 'Portal connection',
    what: 'Changes in the supplier portal (KYC decisions, audits, stage moves, suspensions, stories) arrive here as signals. Each one is stored first and retried every 5 minutes if it fails; every producer is also re-checked nightly.',
    now: ({ o }) =>
      o
        ? {
            text: o.inbox.deadLettered
              ? `${o.inbox.deadLettered} signal(s) failed 10 times.`
              : `${o.inbox.pending} waiting. Last signal ${o.inbox.lastReceivedAt ? new Date(o.inbox.lastReceivedAt).toLocaleString() : 'never'}.`,
            level: o.inbox.deadLettered ? 'bad' : o.inbox.pending > 20 ? 'watch' : 'good',
          }
        : null,
  },
  identity: { title: CHECK_LABEL.identity, what: 'The producer’s ID was checked in the portal’s KYC step.', now: pass('identity') },
  registered: { title: CHECK_LABEL.registered, what: 'A CAC registration number and a TIN were given at Stage 3 (registration).', now: pass('registered') },
  audit: {
    title: CHECK_LABEL.audit,
    what: 'The Quality & Compliance facility audit was signed off with outcome APPROVED. PROVISIONAL does not count. Producers who fail go through VOLTRON to fix the gaps and are re-audited.',
    now: pass('audit'),
  },
  stage: { title: CHECK_LABEL.stage, what: 'The producer reached stage 8 (Activation & Listing) of the 10-stage supplier journey.', now: pass('stage') },
  active: { title: CHECK_LABEL.active, what: 'The supplier account is not suspended. A suspension removes the badge within about a minute.', now: pass('active') },
};

// ---- advisor -------------------------------------------------------------

const BLOCKER_FIX: Record<CheckKey, string> = {
  identity: 'Clear the KYC review queue in the supplier portal (Supplier Ops → KYC).',
  registered: 'Ask them to complete Stage 3 registration with their CAC number and TIN.',
  audit: 'Book their re-audit with Quality & Compliance (or close the CAPA items if provisional).',
  stage: 'Move them through Activation & Listing once the earlier stages are done.',
  active: 'Check why the account is suspended and reactivate it if resolved.',
};

export function adviseTrace(o: TraceOverview | null): Advice {
  if (!o) return { overall: 'green', headline: 'Loading traceability…', tips: [] };
  const tips: Tip[] = [];
  const p = o.producers;

  if (o.inbox.deadLettered > 0) {
    tips.push({
      id: 'inbox-dead',
      severity: 'red',
      title: `${o.inbox.deadLettered} portal signal(s) keep failing`,
      happening: 'Changes from the supplier portal could not be applied after 10 tries, so some producers may show the wrong badge until the nightly re-check.',
      doThis: ['Ask the tech team to check the API logs for “trace.inbox_process_failed”.', 'Meanwhile press “Re-check all producers” in Admin → Traceability.'],
    });
  }

  if (p.total > 0 && p.verified === 0 && (p.checkPass.audit ?? 0) === 0) {
    tips.push({
      id: 'no-audits',
      severity: 'red',
      title: 'No producer has passed a facility audit yet',
      happening: `None of the ${p.total} producers can be Verified, because no audit has been signed off as APPROVED. Every other check can be perfect and the badge still stays off.`,
      doThis: [
        'Ask Quality & Compliance which VOLTRON producers are ready for re-audit, and book them.',
        'Keep linking products and publishing stories anyway — Meet the Maker shows without the badge, and the badge appears by itself once an audit passes.',
      ],
    });
  }

  if (p.oneStepAway > 0) {
    const blockers = Object.entries(p.blockers).sort((a, b) => b[1] - a[1]) as [CheckKey, number][];
    tips.push({
      id: 'close',
      severity: 'yellow',
      title: `${p.oneStepAway} producer${p.oneStepAway === 1 ? ' is' : 's are'} one step from Verified`,
      happening: `What blocks them: ${blockers.map(([k, n]) => `${CHECK_LABEL[k].toLowerCase()} (${n})`).join(', ')}.`,
      doThis: [...blockers.map(([k]) => BLOCKER_FIX[k]), 'See who they are: Admin → Traceability → Producers → “One step away”.'],
    });
  }

  if (o.products.approvedPiqs > 0 && o.products.linked < o.products.approvedPiqs / 2) {
    tips.push({
      id: 'links',
      severity: 'yellow',
      title: `Only ${o.products.linked} of ${o.products.approvedPiqs} portal products are linked to a marketplace product`,
      happening: 'Unlinked products can’t show their maker’s story or badge, even when the producer is verified.',
      doThis: ['Admin → Traceability → Link products: work through “Suggested matches” — open each product first, and be careful with generic names (flagged in amber).'],
    });
  }

  if (o.stories.published === 0 && p.total > 0) {
    tips.push({
      id: 'stories',
      severity: 'yellow',
      title: 'No producer stories published yet',
      happening: 'Meet the Maker has nothing to tell customers about portal producers until a story is written and approved.',
      doThis: ['Ask account officers to get producers to fill in “Our story” in the supplier portal (/story).', 'Approve submitted stories in the portal admin → Producer stories.'],
    });
  }

  const pct = p.total ? Math.round((p.verified / p.total) * 100) : null;
  return {
    overall: tips.some((t) => t.severity === 'red') ? 'red' : tips.length ? 'yellow' : 'green',
    headline:
      p.verified > 0
        ? `${p.verified} verified producer${p.verified === 1 ? '' : 's'} — their products carry the badge.`
        : 'No verified producers yet.',
    meter: {
      label: 'Producers verified',
      pct,
      left: '0%',
      right: '100%',
      explainKey: 'verified',
      goodWhen: 'high',
    },
    tips,
  };
}
