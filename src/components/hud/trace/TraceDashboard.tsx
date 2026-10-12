'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdvisorPanel } from '@/components/hud/common/AdvisorPanel';
import { Explain, ExplainProvider } from '@/components/hud/common/Explain';
import {
  ADMIN_TRACE,
  CHECK_LABEL,
  CHECK_ORDER,
  EVENT_LABEL,
  TRACE_EXPLAIN,
  adviseTrace,
  fetchTraceOverview,
  fetchTraceProducers,
  type TraceCtx,
  type TraceOverview,
  type TraceProducer,
} from '@/lib/hud/trace';

/**
 * Traceability — the producer side of the platform at a glance:
 *   • the road to Verified (how many producers pass each check)
 *   • every producer as a row of five lights
 *   • producers per country
 *   • the live ledger feed with each event's fingerprint
 * plus hover explanations and an Advisor that says which desk to push.
 * Polls every minute (portal changes land within seconds server-side).
 */

function Flag({ cc }: { cc: string }) {
  if (!/^[A-Za-z]{2}$/.test(cc)) return <span>🌍</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://flagcdn.com/h20/${cc.toLowerCase()}.png`} alt={cc} className="inline-block h-[11px] rounded-[2px] align-[-1px]" />;
}

export function TraceDashboard() {
  const [o, setO] = useState<TraceOverview | null>(null);
  const [producers, setProducers] = useState<TraceProducer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, pr] = await Promise.all([fetchTraceOverview(), fetchTraceProducers()]);
      setO(ov);
      setProducers(pr.items);
      setUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const ctx: TraceCtx = { o };
  const advice = useMemo(() => adviseTrace(o), [o]);
  const countries = useMemo(
    () => Object.entries(o?.producers.byCountry ?? {}).sort((a, b) => b[1].total - a[1].total),
    [o],
  );

  return (
    <ExplainProvider registry={TRACE_EXPLAIN} ctx={ctx}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-raleway text-lg font-bold text-amber text-glow">Traceability</h1>
          <span className="font-mono text-[11px] text-amber/40">● refreshes every minute</span>
          <a href={ADMIN_TRACE} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[11px] text-amber underline">
            Open Admin → Traceability ↗
          </a>
        </div>
        <p className="-mt-2 font-mono text-[10px] text-amber/40">
          Hover over anything for a plain-English explanation. {updated && `Updated ${updated.toLocaleTimeString()}.`}
        </p>
        {error && <div className="rounded border border-danger/50 p-2 font-mono text-[11px] text-danger">Couldn’t load traceability: {error}</div>}

        <AdvisorPanel advice={advice} />

        {/* headline numbers */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {(
            [
              ['verified', 'Verified producers', o ? `${o.producers.verified}/${o.producers.total}` : '—', !!o && o.producers.verified === 0],
              ['close', 'One step away', o ? String(o.producers.oneStepAway) : '—', false],
              ['linked', 'Products with a maker', o ? String(o.products.linked) : '—', false],
              ['stories', 'Stories published', o ? String(o.stories.published) : '—', false],
              ['ledger', 'Ledger events', o ? String(o.events.total) : '—', false],
            ] as const
          ).map(([k, label, value, bad]) => (
            <Explain key={k} k={k}>
              <div className="hud-panel h-full p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-amber/60">{label}</div>
                <div className={`font-mono text-2xl ${bad ? 'text-danger text-glow-red' : 'text-amber text-glow'}`}>{value}</div>
              </div>
            </Explain>
          ))}
        </div>

        {/* road to verified */}
        <div className="hud-panel p-4">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-amber/60">The road to Verified — producers passing each check</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {CHECK_ORDER.map((k, i) => {
              const n = o?.producers.checkPass[k] ?? 0;
              const total = o?.producers.total ?? 0;
              const pct = total ? (n / total) * 100 : 0;
              return (
                <Explain key={k} k={k}>
                  <div className={`relative rounded border p-3 ${n === 0 && total ? 'border-danger/70 bg-danger/5' : 'border-amber/20'}`}>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-amber/60">
                      {i + 1}. {CHECK_LABEL[k]}
                    </div>
                    <div className={`font-mono text-2xl ${n === 0 && total ? 'text-danger text-glow-red' : 'text-amber text-glow'}`}>{n}</div>
                    <div className="mt-2 h-1.5 rounded bg-amber/10">
                      <div className={`h-full rounded ${n === 0 ? 'bg-danger' : 'bg-success/80'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {i < CHECK_ORDER.length - 1 && <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-amber/40 md:block">›</span>}
                  </div>
                </Explain>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* producer lights */}
          <div className="hud-panel p-4 lg:col-span-2">
            <div className="mb-2 flex items-center font-mono text-[10px] uppercase tracking-widest text-amber/60">
              Producers — five lights each, closest to Verified first
              <span className="ml-auto normal-case tracking-normal text-amber/40">
                {CHECK_ORDER.map((k, i) => `${i + 1} ${CHECK_LABEL[k].split(' ')[0].toLowerCase()}`).join(' · ')}
              </span>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full font-mono text-[11px]">
                <tbody>
                  {producers.map((p) => (
                    <tr key={p.id} className="border-t border-amber/10 text-amber/90">
                      <td className="py-1 pr-2">
                        {p.country && <Flag cc={p.country} />} <span className={p.verified ? 'text-success' : ''}>{p.name}</span>
                        {p.verified && <span className="ml-1 text-success">✔ verified</span>}
                      </td>
                      <td className="whitespace-nowrap px-2">
                        {CHECK_ORDER.map((k) => {
                          const c = p.checks.find((x) => x.key === k);
                          return (
                            <span
                              key={k}
                              title={c ? `${c.label}: ${c.detail}` : k}
                              className={`mr-1 inline-block h-2.5 w-2.5 rounded-full ${c?.ok ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.8)]' : 'bg-danger/70'}`}
                            />
                          );
                        })}
                      </td>
                      <td className="px-2 text-amber/50">stage {p.stage}</td>
                      <td className="px-2 text-right text-amber/50">
                        {p.linkedProducts ? `${p.linkedProducts} product${p.linkedProducts === 1 ? '' : 's'}` : ''}
                        {p.hasStory ? ' · story' : ''}
                      </td>
                    </tr>
                  ))}
                  {!producers.length && (
                    <tr>
                      <td className="py-6 text-center text-amber/40">No producers yet — they appear a few minutes after the API starts.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {/* countries */}
            <div className="hud-panel p-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber/60">Producers by country</div>
              {countries.map(([cc, v]) => (
                <div key={cc} className="flex items-center gap-2 py-0.5 font-mono text-[11px] text-amber/90">
                  <Flag cc={cc} /> <span className="w-8">{cc}</span>
                  <div className="h-1.5 flex-1 rounded bg-amber/10">
                    <div className="h-full rounded bg-amber/70" style={{ width: `${(v.total / Math.max(1, countries[0]?.[1].total ?? 1)) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right">
                    {v.total}
                    {v.verified ? <span className="text-success"> · {v.verified}✔</span> : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* ledger feed */}
            <div className="hud-panel p-4">
              <Explain k="ledger">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber/60">Ledger — latest events ⓘ</div>
              </Explain>
              <ol className="max-h-[260px] space-y-1 overflow-auto">
                {(o?.events.recent ?? []).map((e) => (
                  <li key={e.eventId} className="font-mono text-[10px] leading-tight text-amber/80">
                    <span className="text-amber/40">{new Date(e.ts).toLocaleTimeString()}</span>{' '}
                    <span className={e.eventType === 'PRODUCER_VERIFIED' ? 'text-success' : e.eventType === 'PRODUCER_REVOKED' ? 'text-danger' : ''}>
                      {EVENT_LABEL[e.eventType] ?? e.eventType}
                    </span>{' '}
                    — {e.subjectLabel} <span className="text-amber/30">#{e.hash.slice(0, 8)}</span>
                  </li>
                ))}
              </ol>
              <Explain k="inbox">
                <div className="mt-2 border-t border-amber/10 pt-2 font-mono text-[10px] text-amber/50">
                  Portal link:{' '}
                  {o?.inbox.deadLettered ? (
                    <span className="text-danger">{o.inbox.deadLettered} failing</span>
                  ) : (
                    <span className="text-success">healthy</span>
                  )}
                  {o?.inbox.pending ? ` · ${o.inbox.pending} waiting` : ''} ⓘ
                </div>
              </Explain>
            </div>
          </div>
        </div>
      </div>
    </ExplainProvider>
  );
}
