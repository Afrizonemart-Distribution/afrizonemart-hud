'use client';

import { useState } from 'react';
import type { Advice, Severity } from '@/lib/hud/advisor';
import { Explain } from './Explain';

/**
 * The Advisor bar: overall status, how many shoppers this server can hold
 * at once, and plain-English "what's happening / do this" cards — worst
 * first, cheapest fix first within each card.
 */

const SEV: Record<Severity, { dot: string; ring: string; text: string; word: string }> = {
  red: { dot: 'bg-danger', ring: 'border-danger/60', text: 'text-danger', word: 'Action needed' },
  yellow: { dot: 'bg-amber', ring: 'border-amber/60', text: 'text-amber', word: 'Keep an eye on it' },
  green: { dot: 'bg-success', ring: 'border-success/50', text: 'text-success', word: 'Healthy' },
};

export function AdvisorPanel({ advice, mode }: { advice: Advice; mode: 'live' | 'staging' | 'sim' }) {
  const [open, setOpen] = useState<string | null>(null);
  const s = SEV[advice.overall];
  const cap = advice.capacity;
  const pct = cap.pct ?? 0;

  return (
    <div className={`hud-panel border ${s.ring} p-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-3 w-3 animate-pulse rounded-full ${s.dot}`} />
        <span className={`font-mono text-[11px] font-bold uppercase tracking-widest ${s.text}`}>Advisor · {s.word}</span>
        <span className="font-sans text-[13px] text-amber-light">{advice.headline}</span>
        {mode === 'sim' && <span className="font-mono text-[10px] text-info">(practice numbers from SIM)</span>}
      </div>

      <Explain k="capacity">
        <div className="mt-3">
          <div className="flex justify-between font-mono text-[10px] text-amber/60">
            <span>
              CAPACITY · {cap.now.toLocaleString()} shoppers now
              {cap.max ? ` of ~${cap.max.toLocaleString()} this server can hold` : ''}
            </span>
            <span>bottleneck: {cap.bottleneck}</span>
          </div>
          <div className="relative mt-1 h-3 overflow-hidden rounded bg-amber/10">
            <div
              className={`h-full transition-all ${pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-amber' : 'bg-success'}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
            <div className="absolute inset-y-0 border-l border-dashed border-amber/60" style={{ left: '75%' }} title="75%: plan to scale before here" />
          </div>
          {cap.max === null && <div className="mt-1 font-mono text-[10px] text-amber/40">Needs some traffic to estimate — try SIM or a load test.</div>}
        </div>
      </Explain>

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
