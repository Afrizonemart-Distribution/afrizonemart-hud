'use client';

import { useState } from 'react';
import type { Advice, Severity } from '@/lib/hud/advice';
import { Explain } from './Explain';

/**
 * The Advisor bar, shared by every HUD page: overall status, an optional
 * meter (capacity, on-time orders, conversion…), and plain-English
 * "what's happening / do this" cards — worst first, cheapest fix first.
 */

const SEV: Record<Severity, { dot: string; ring: string; text: string; word: string }> = {
  red: { dot: 'bg-danger', ring: 'border-danger/60', text: 'text-danger', word: 'Action needed' },
  yellow: { dot: 'bg-amber', ring: 'border-amber/60', text: 'text-amber', word: 'Keep an eye on it' },
  green: { dot: 'bg-success', ring: 'border-success/50', text: 'text-success', word: 'Healthy' },
};

export function AdvisorPanel({ advice, note }: { advice: Advice; note?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const s = SEV[advice.overall];
  const m = advice.meter;
  const pct = m?.pct ?? 0;

  const meter = m && (
    <div className="mt-3">
      <div className="flex justify-between gap-3 font-mono text-[10px] text-amber/60">
        <span>{m.left}</span>
        <span>{m.right}</span>
      </div>
      <div className="relative mt-1 h-3 overflow-hidden rounded bg-amber/10">
        <div
          className={`h-full transition-all ${
            m.goodWhen === 'high'
              ? pct >= 40 ? 'bg-success' : pct >= 10 ? 'bg-amber' : 'bg-danger'
              : pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-amber' : 'bg-success'
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
        {m.mark !== undefined && <div className="absolute inset-y-0 border-l border-dashed border-amber/60" style={{ left: `${m.mark}%` }} />}
      </div>
      {m.note && <div className="mt-1 font-mono text-[10px] text-amber/40">{m.note}</div>}
    </div>
  );

  return (
    <div className={`hud-panel border ${s.ring} p-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-3 w-3 animate-pulse rounded-full ${s.dot}`} />
        <span className={`font-mono text-[11px] font-bold uppercase tracking-widest ${s.text}`}>Advisor · {s.word}</span>
        <span className="font-sans text-[13px] text-amber-light">{advice.headline}</span>
        {note && <span className="font-mono text-[10px] text-info">{note}</span>}
      </div>

      {meter && (m?.explainKey ? <Explain k={m.explainKey}>{meter}</Explain> : meter)}

      {advice.tips.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {advice.tips.map((t) => {
            const ts = SEV[t.severity];
            const isOpen = open === t.id || (open === null && t === advice.tips[0]);
            return (
              <div key={t.id} className={`rounded border ${ts.ring} bg-void/60`}>
                <button onClick={() => setOpen(isOpen ? '' : t.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ts.dot}`} />
                  <span className={`font-raleway text-[13px] font-bold ${ts.text}`}>{t.title}</span>
                  <span className="ml-auto font-mono text-[10px] text-amber/40">{isOpen ? '▾' : '▸ what to do'}</span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3">
                    <p className="font-sans text-[12px] text-amber-light/90">
                      <b className="text-amber">What’s happening: </b>
                      {t.happening}
                    </p>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-amber/50">Do this (cheapest first)</div>
                    <ol className="mt-1 list-decimal space-y-1 pl-5 font-sans text-[12px] text-amber-light/90">
                      {t.doThis.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
