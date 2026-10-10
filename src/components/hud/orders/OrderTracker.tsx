'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdvisorPanel } from '@/components/hud/common/AdvisorPanel';
import { Explain, ExplainProvider } from '@/components/hud/common/Explain';
import {
  ORDERS_EXPLAIN,
  STAGE_LABEL,
  STEP_LABEL,
  adviseFunnel,
  adviseOrders,
  age,
  fetchFunnel,
  fetchPipeline,
  naira,
  type Funnel,
  type OrdersCtx,
  type Pipeline,
  type Stage,
} from '@/lib/hud/orders';
import { useHudLiveEvents } from '@/lib/hud/useHudLiveEvents';
import { useAuthStore } from '@/stores/authStore';

/**
 * Order Journey tracker: every order's stage, how long it's been there,
 * which customers are waiting too long, where shoppers drop off before
 * paying, and delivery times — with hover explanations and an Advisor
 * that says what to do. Refreshes on every live order event.
 */

const FLOW: Stage[] = ['PENDING_PAYMENT', 'PAID', 'FULFILLING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const EVENT_STAGE: Record<string, Stage> = {
  'order.paid': 'PAID',
  'order.shipped': 'SHIPPED',
  'order.out_for_delivery': 'OUT_FOR_DELIVERY',
  'order.delivered': 'DELIVERED',
  'order.cancelled': 'CANCELLED',
  'order.refunded': 'REFUNDED',
};
const ADMIN_ORDERS = 'https://afrizonemart.com/admin/orders';

function Flag({ cc }: { cc: string }) {
  if (!/^[A-Za-z]{2}$/.test(cc)) return <span>🌍</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://flagcdn.com/h20/${cc.toLowerCase()}.png`} alt={cc} className="inline-block h-[11px] rounded-[2px] align-[-1px]" />;
}

export function OrderTracker() {
  const [days, setDays] = useState(30);
  const [pipe, setPipe] = useState<Pipeline | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [funnelBlocked, setFunnelBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [flash, setFlash] = useState<Partial<Record<Stage, number>>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const token = useAuthStore((s) => s.accessToken);

  const load = useCallback(async () => {
    try {
      setPipe(await fetchPipeline(days));
      setUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    if (token) {
      try {
        const f = await fetchFunnel(days, token);
        if (f === 'forbidden') setFunnelBlocked(true);
        else setFunnel(f);
      } catch {
        /* funnel is optional */
      }
    }
  }, [days, token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Live: any order event refreshes the board and flashes its stage.
  const reload = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { connected } = useHudLiveEvents((e) => {
    const stage = EVENT_STAGE[e.event];
    if (!stage) return;
    setFlash((f) => ({ ...f, [stage]: Date.now() }));
    if (reload.current) clearTimeout(reload.current);
    reload.current = setTimeout(() => void load(), 1500);
  });

  const ctx: OrdersCtx = { pipe, funnel };
  const orderAdvice = useMemo(() => adviseOrders(pipe), [pipe]);
  const funnelAdvice = useMemo(() => adviseFunnel(funnel), [funnel]);
  const stage = (s: Stage) => pipe?.stages.find((x) => x.stage === s);

  const copy = (n: string) => {
    void navigator.clipboard?.writeText(n);
    setCopied(n);
    setTimeout(() => setCopied(null), 1500);
  };

  const visits = funnel?.steps[0]?.visits ?? 0;

  return (
    <ExplainProvider registry={ORDERS_EXPLAIN} ctx={ctx}>
      <div className="flex flex-col gap-4">
        {/* header */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-raleway text-lg font-bold text-amber text-glow">Order Journey</h1>
          <span className={`font-mono text-[11px] ${connected ? 'text-success' : 'text-amber/40'}`}>● {connected ? 'live' : 'polling every minute'}</span>
          <div className="ml-auto flex gap-1">
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded border px-2 py-1 font-mono text-[11px] ${days === d ? 'border-amber text-amber' : 'border-amber/20 text-amber/50'}`}
              >
                {d === 365 ? '1 year' : `${d} days`}
              </button>
            ))}
          </div>
        </div>
        <p className="-mt-2 font-mono text-[10px] text-amber/40">
          Hover over anything for a plain-English explanation. {updated && `Updated ${updated.toLocaleTimeString()}.`}
        </p>
        {error && <div className="rounded border border-danger/50 p-2 font-mono text-[11px] text-danger">Couldn’t load orders: {error}</div>}

        <AdvisorPanel advice={orderAdvice} />

        {/* stage board */}
        <div className="hud-panel p-4">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-amber/60">Where every order is right now</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {FLOW.map((s, i) => {
              const st = stage(s);
              const late = pipe?.stuck.filter((x) => x.stage === s).length ?? 0;
              const n = st?.count ?? 0;
              const hot = flash[s] && Date.now() - (flash[s] ?? 0) < 4000;
              return (
                <Explain key={s} k={s}>
                  <div
                    className={`relative h-full rounded border p-3 transition-all ${
                      late ? 'border-danger/70 bg-danger/5' : 'border-amber/20'
                    } ${hot ? 'shadow-glow ring-1 ring-amber' : ''}`}
                  >
                    <div className="font-mono text-[10px] uppercase tracking-widest text-amber/60">
                      {i + 1}. {STAGE_LABEL[s]}
                    </div>
                    <div className={`font-mono text-2xl ${late ? 'text-danger text-glow-red' : 'text-amber text-glow'}`}>{n}</div>
                    <div className="font-mono text-[10px] text-amber/50">{naira(st?.value ?? 0)}</div>
                    {pipe?.targets[s] && <div className="font-mono text-[10px] text-amber/40">target {age(pipe.targets[s]!)}</div>}
                    {late > 0 && <div className="mt-1 font-mono text-[10px] font-bold text-danger">{late} late · oldest {age(st?.oldestHours ?? 0)}</div>}
                    {/* parcels */}
                    <div className="mt-2 flex flex-wrap gap-[3px]">
                      {Array.from({ length: Math.min(n, 24) }, (_, k) => (
                        <span key={k} className={`h-2.5 w-2.5 rounded-[2px] ${k < late ? 'bg-danger' : s === 'PENDING_PAYMENT' ? 'bg-amber/30' : 'bg-success/80'}`} />
                      ))}
                      {n > 24 && <span className="font-mono text-[9px] text-amber/50">+{n - 24}</span>}
                    </div>
                    {i < FLOW.length - 1 && <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-amber/40 md:block">›</span>}
                  </div>
                </Explain>
              );
            })}
          </div>
          <div className="mt-2 flex gap-3 font-mono text-[10px] text-amber/50">
            <Explain k="CANCELLED">
              <span>✖ Cancelled: {stage('CANCELLED')?.count ?? 0}</span>
            </Explain>
            <Explain k="REFUNDED">
              <span>↩ Refunded: {stage('REFUNDED')?.count ?? 0}</span>
            </Explain>
            <span className="ml-auto">
              <span className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-danger" />late
              <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-[2px] bg-success/80" />on time
              <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-[2px] bg-amber/30" />unpaid
            </span>
          </div>
        </div>

        {/* stuck orders */}
        {!!pipe?.stuck.length && (
          <div className="hud-panel p-4">
            <Explain k="stuck">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-danger">
                Customers waiting too long ({pipe.stuckCount}) ⓘ
                <a href={ADMIN_ORDERS} target="_blank" rel="noreferrer" className="ml-auto normal-case tracking-normal text-amber underline">
                  Open Admin → Orders ↗
                </a>
              </div>
            </Explain>
            <table className="w-full font-mono text-[11px]">
              <thead className="text-amber/50">
                <tr>
                  <th className="text-left">order</th>
                  <th className="text-left">stuck at</th>
                  <th className="w-1/3 text-left">waiting vs target</th>
                  <th className="text-left">to</th>
                  <th className="text-right">amount</th>
                </tr>
              </thead>
              <tbody>
                {pipe.stuck.map((o) => {
                  const over = Math.min(100, (o.targetHours / o.hoursInStage) * 100);
                  return (
                    <tr key={o.orderNumber} className="border-t border-amber/10 text-amber/90">
                      <td className="py-1">
                        <button onClick={() => copy(o.orderNumber)} className="hover:text-amber" title="Copy, then paste into Admin → Orders search">
                          {o.orderNumber} {copied === o.orderNumber ? '✓ copied' : '⧉'}
                        </button>
                      </td>
                      <td>{STAGE_LABEL[o.stage]}</td>
                      <td>
                        <div className="relative h-2 rounded bg-danger/60" title={`${age(o.hoursInStage)} vs target ${age(o.targetHours)}`}>
                          <div className="absolute inset-y-0 left-0 rounded bg-success/70" style={{ width: `${over}%` }} />
                        </div>
                        <span className="text-[10px] text-danger">
                          {age(o.hoursInStage)} <span className="text-amber/40">(target {age(o.targetHours)})</span>
                        </span>
                      </td>
                      <td>
                        <Flag cc={o.country} /> {o.country}
                      </td>
                      <td className="text-right">{naira(o.total, o.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* customer journey */}
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="hud-panel p-4">
            <Explain k="funnel">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber/60">Customer journey · last {days} days ⓘ</div>
            </Explain>
            {funnelBlocked ? (
              <p className="font-mono text-[11px] text-amber/50">Visit data is only shown to the Store Game viewer (STORE_GAME_VIEWER_IDS).</p>
            ) : !funnel ? (
              <p className="font-mono text-[11px] text-amber/40">Loading…</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {funnel.steps.map((s, i) => {
                  const prev = i ? funnel.steps[i - 1].visits : s.visits;
                  const keep = prev ? s.visits / prev : 0;
                  const w = visits ? (s.visits / visits) * 100 : 0;
                  return (
                    <div key={s.step} className="font-mono text-[11px]">
                      <div className="flex justify-between text-amber/80">
                        <span>{STEP_LABEL[s.step] ?? s.step}</span>
                        <span>
                          {s.visits.toLocaleString()}
                          {i > 0 && prev > 0 && <span className={keep < 0.3 ? 'text-danger' : 'text-amber/40'}> · {Math.round(keep * 100)}% kept</span>}
                        </span>
                      </div>
                      <div className="h-2.5 rounded bg-amber/10">
                        <div className="h-full rounded bg-amber/80" style={{ width: `${Math.max(w, s.visits ? 1 : 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
                {!!funnel.failReasons.length && (
                  <div className="mt-2 font-mono text-[10px] text-amber/60">
                    Why payments failed: {funnel.failReasons.map((r) => `${r.reason} (${r.count})`).join(' · ')}
                  </div>
                )}
                {!!funnel.platforms.length && (
                  <div className="mt-1 font-mono text-[10px] text-amber/50">
                    {funnel.platforms
                      .map((p) => {
                        const v = p.steps[0]?.visits ?? 0;
                        const paid = p.steps.find((x) => x.step === 'pay_ok')?.visits ?? 0;
                        return `${p.platform}: ${v} visits → ${paid} paid`;
                      })
                      .join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
          {!funnelBlocked && <AdvisorPanel advice={funnelAdvice} />}
        </div>

        {/* delivery times */}
        <Explain k="delivery">
          <div className="hud-panel p-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber/60">Delivery time per country ⓘ</div>
            {!pipe?.deliveryByCountry.length ? (
              <p className="font-mono text-[11px] text-amber/40">No deliveries recorded in this period yet.</p>
            ) : (
              <div className="flex flex-wrap gap-3 font-mono text-[11px] text-amber/90">
                {pipe.deliveryByCountry.map((d) => (
                  <span key={d.country}>
                    <Flag cc={d.country} /> {d.country}: {age(d.medianHours)} ({d.delivered})
                  </span>
                ))}
              </div>
            )}
          </div>
        </Explain>
      </div>
    </ExplainProvider>
  );
}
