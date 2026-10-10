'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Explanation, Level } from '@/lib/hud/advice';

/**
 * Hover-to-explain, shared by every HUD page. Wrap a page in
 * <ExplainProvider registry={…} ctx={liveData}> and anything in
 * <Explain k="key"> (or call `show(explanation)` from a canvas) gets a
 * plain-English card that follows the mouse: what it is, what it's doing
 * right now, and what good / bad looks like.
 */

interface Tip {
  e: Explanation<never>;
  x: number;
  y: number;
}

type ShowFn = (e: Explanation<never> | null, x: number, y: number) => void;
const Ctx = createContext<{ show: ShowFn; registry: Record<string, Explanation<never>> }>({ show: () => {}, registry: {} });

export function ExplainProvider<C>({
  registry,
  ctx,
  children,
}: {
  registry: Record<string, Explanation<C>>;
  /** live data for the "right now" line; null until it loads */
  ctx: C | null;
  children: ReactNode;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = useCallback<ShowFn>((e, x, y) => setTip(e ? { e, x, y } : null), []);
  return (
    <Ctx.Provider value={{ show, registry: registry as unknown as Record<string, Explanation<never>> }}>
      {children}
      {tip && <ExplainCard tip={tip} ctx={ctx} />}
    </Ctx.Provider>
  );
}

export function useExplain() {
  return useContext(Ctx);
}

/** Hover target: `k` is a key in the page's registry, or pass `e` directly. */
export function Explain({ k, e, children, className = '' }: { k?: string; e?: Explanation<never>; children: ReactNode; className?: string }) {
  const { show, registry } = useExplain();
  const ex = e ?? (k ? registry[k] : undefined);
  if (!ex) return <>{children}</>;
  return (
    <div className={`cursor-help ${className}`} onMouseMove={(ev) => show(ex, ev.clientX, ev.clientY)} onMouseLeave={() => show(null, 0, 0)}>
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

function ExplainCard<C>({ tip, ctx }: { tip: Tip; ctx: C | null }) {
  let now: { text: string; level: Level } | null = null;
  try {
    now = tip.e.now && ctx !== null ? (tip.e.now as unknown as (c: C) => { text: string; level: Level } | null)(ctx) : null;
  } catch {
    now = null; // data not loaded yet
  }
  const w = 320;
  const left = Math.min(tip.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1600) - w - 12);
  const top = Math.min(Math.max(12, tip.y - 12), (typeof window !== 'undefined' ? window.innerHeight : 900) - 220);
  return (
    <div
      className="pointer-events-none fixed z-[90] rounded-lg border border-amber/40 bg-[#070a24]/95 p-3 shadow-panel backdrop-blur"
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
