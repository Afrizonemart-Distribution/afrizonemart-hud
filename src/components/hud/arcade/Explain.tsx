'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { EXPLAIN, type Explanation, type Level } from '@/lib/hud/explain';
import type { PulseSnapshot } from '@/lib/hud/pulseTypes';

/**
 * Hover-to-explain for the Backend Arcade. Wrap anything in <Explain k="p95">
 * (or call `show` from the canvas) and a plain-English card follows the
 * mouse: what it is, what it's doing right now, and what good/bad looks like.
 */

interface Tip {
  e: Explanation;
  x: number;
  y: number;
}

const Ctx = createContext<{ show: (e: Explanation | null, x: number, y: number) => void }>({ show: () => {} });

export function ExplainProvider({ snap, children }: { snap: PulseSnapshot | null; children: ReactNode }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = useCallback((e: Explanation | null, x: number, y: number) => setTip(e ? { e, x, y } : null), []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {tip && <ExplainCard tip={tip} snap={snap} />}
    </Ctx.Provider>
  );
}

export function useExplain() {
  return useContext(Ctx);
}

/** Hover target. `k` is a key in EXPLAIN. */
export function Explain({ k, children, className = '' }: { k: string; children: ReactNode; className?: string }) {
  const { show } = useExplain();
  const e = EXPLAIN[k];
  if (!e) return <>{children}</>;
  return (
    <div
      className={`cursor-help ${className}`}
      onMouseMove={(ev) => show(e, ev.clientX, ev.clientY)}
      onMouseLeave={() => show(null, 0, 0)}
    >
      {children}
    </div>
  );
}

const LEVEL_STYLE: Record<Level, string> = {
  good: 'border-success/60 text-success',
  watch: 'border-amber/70 text-amber',
  bad: 'border-danger/70 text-danger',
  info: 'border-info/50 text-info',
};
const LEVEL_WORD: Record<Level, string> = { good: '🟢 Good', watch: '🟡 Watch', bad: '🔴 Problem', info: 'ℹ Right now' };

function ExplainCard({ tip, snap }: { tip: Tip; snap: PulseSnapshot | null }) {
  const now = snap && tip.e.now ? tip.e.now(snap) : null;
  // keep the card on screen
  const w = 320;
  const left = Math.min(tip.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1600) - w - 12);
  const top = Math.max(12, tip.y - 12);
  return (
    <div
      className="pointer-events-none fixed z-[80] rounded-lg border border-amber/40 bg-[#070a24]/95 p-3 shadow-panel backdrop-blur"
      style={{ left, top, width: w }}
    >
      <div className="font-raleway text-sm font-bold text-amber">{tip.e.title}</div>
      <p className="mt-1 font-sans text-[12px] leading-snug text-amber-light/90">{tip.e.what}</p>
      {now && (
        <div className={`mt-2 rounded border px-2 py-1 font-mono text-[11px] ${LEVEL_STYLE[now.level]}`}>
          <b>{LEVEL_WORD[now.level]}:</b> {now.text}
        </div>
      )}
      {tip.e.scale && <p className="mt-2 font-sans text-[11px] leading-snug text-amber/60">{tip.e.scale}</p>}
    </div>
  );
}
