'use client';

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StoreEngine, type HoverInfo, type StoreStats } from '@/lib/storeGame/engine';
import { buildLayout } from '@/lib/storeGame/layout';
import { loadCategories, productInfo, sampleProducts } from '@/lib/storeGame/catalog';
import { startDemo } from '@/lib/storeGame/demo';
import type { CategoryNode, StoreEvent } from '@/lib/storeGame/types';
import { useAuthStore } from '@/stores/authStore';

/**
 * HUD Store Game — Afrizonemart as a live, Sims-style store. Every
 * shopper's visit is a character acting out its real steps (walk in,
 * browse an aisle, look at a shelf, basket, till, pay or fail, leave).
 *
 *   LIVE    GET /api/hud/store/stream (SSE) — viewer-allowlisted
 *   REPLAY  GET /api/hud/store/replay — any day in the last 90, scrub + speed
 *   DEMO    invented shoppers on the real catalog (labelled), for before
 *           live data exists
 *
 * The engine owns its render loop; this component only polls stats and
 * hover at 4 Hz and flushes the event ticker at 2 Hz.
 */

type Mode = 'live' | 'replay' | 'demo';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SPEEDS = [1, 10, 60, 300];

const STEP_LABEL: Record<StoreEvent['t'], string> = {
  enter: 'walked in',
  aisle: 'browsing',
  shelf: 'looking at',
  search: 'searched',
  cart_add: 'added to basket',
  checkout: 'at the till',
  pay_ok: 'paid',
  pay_fail: 'payment failed',
  error: 'hit an error',
  leave: 'left',
};

function flag(cc?: string | null): string {
  if (!cc || cc.length !== 2) return '🌍';
  return String.fromCodePoint(...cc.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function dayBounds(day: string): { from: number; to: number } {
  const from = new Date(`${day}T00:00:00`).getTime();
  return { from, to: from + 24 * 60 * 60 * 1000 };
}

function yesterday(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function StoreGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StoreEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [fallbackCats, setFallbackCats] = useState(false);
  const [mode, setMode] = useState<Mode>('demo');
  const [status, setStatus] = useState('');
  const [stats, setStats] = useState<StoreStats>({ inStore: 0, inAisles: 0, atTills: 0, items: 0 });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [ticker, setTicker] = useState<StoreEvent[]>([]);
  const tickBuf = useRef<StoreEvent[]>([]);
  const accessToken = useAuthStore((s) => s.accessToken);

  // ---- engine lifecycle ------------------------------------------------
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let disposed = false;
    const engine = new StoreEngine(el);
    engine.productInfo = productInfo;
    engineRef.current = engine;
    (async () => {
      const { items, fallback } = await loadCategories();
      if (disposed) return;
      setCategories(items);
      setFallbackCats(fallback);
      await engine.init(buildLayout(items));
      if (!disposed) setReady(true);
    })().catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      disposed = true;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // ---- polling for the overlay (never per frame) -------------------------
  useEffect(() => {
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      setStats(e.stats());
      setHover(e.getHover());
    }, 250);
    const tid = setInterval(() => {
      if (!tickBuf.current.length) return;
      const add = tickBuf.current.splice(0);
      setTicker((t) => [...add.reverse(), ...t].slice(0, 14));
    }, 500);
    return () => {
      clearInterval(id);
      clearInterval(tid);
    };
  }, []);

  const feed = useCallback((e: StoreEvent, instant = false) => {
    engineRef.current?.apply(e, instant);
    if (!instant) tickBuf.current.push(e);
  }, []);

  // ---- LIVE + DEMO ---------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine || mode === 'replay') return;
    engine.reset();
    engine.timeScale = 1;
    setTicker([]);
    const clock = setInterval(() => engine.setClock(Date.now()), 1000);

    if (mode === 'demo') {
      setStatus('DEMO — invented shoppers on the real catalog. Not real customers.');
      let stop = () => {};
      let cancelled = false;
      sampleProducts().then((products) => {
        if (!cancelled) stop = startDemo(categories, products, (e) => feed(e));
      });
      return () => {
        cancelled = true;
        stop();
        clearInterval(clock);
      };
    }

    if (!accessToken) {
      setStatus('Sign in again to watch live.');
      return () => clearInterval(clock);
    }
    setStatus('Connecting…');
    const es = new EventSource(`${API}/api/hud/store/stream?token=${encodeURIComponent(accessToken)}`);
    es.onopen = () => setStatus('LIVE — real shoppers, as it happens');
    es.onerror = () =>
      setStatus('Not connected. Needs afrizonemart-api#128 deployed and your id in STORE_GAME_VIEWER_IDS.');
    es.onmessage = (m) => {
      try {
        feed(JSON.parse(m.data) as StoreEvent);
      } catch {
        /* malformed frame */
      }
    };
    return () => {
      es.close();
      clearInterval(clock);
    };
  }, [ready, mode, accessToken, categories, feed]);

  // ---- REPLAY ----------------------------------------------------------------
  const [day, setDay] = useState(yesterday());
  const [events, setEvents] = useState<StoreEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const cursorRef = useRef(0);
  const idxRef = useRef(0);

  useEffect(() => {
    if (mode !== 'replay' || !ready) return;
    const engine = engineRef.current!;
    engine.reset();
    setTicker([]);
    setPlaying(false);
    setEvents([]);
    if (!accessToken) {
      setStatus('Sign in again to load replays.');
      return;
    }
    const { from, to } = dayBounds(day);
    setStatus(`Loading ${day}…`);
    let cancelled = false;
    fetch(`${API}/api/hud/store/replay?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}&token=${encodeURIComponent(accessToken)}`)
      .then(async (r) => {
        if (r.status === 403) throw new Error('Only allowed viewers can load replays.');
        if (!r.ok) throw new Error(`Replay failed (${r.status}). Needs afrizonemart-api#128 deployed.`);
        return (await r.json()) as { items: StoreEvent[]; truncated: boolean };
      })
      .then((body) => {
        if (cancelled) return;
        setEvents(body.items);
        const first = body.items[0]?.at ?? from;
        cursorRef.current = first - 5000;
        idxRef.current = 0;
        setCursor(cursorRef.current);
        const visits = new Set(body.items.map((e) => e.s)).size;
        setStatus(
          body.items.length
            ? `REPLAY ${day} — ${visits.toLocaleString()} visits, ${body.items.length.toLocaleString()} steps${body.truncated ? ' (truncated)' : ''}`
            : `REPLAY ${day} — no visits recorded that day`,
        );
      })
      .catch((e) => !cancelled && setStatus(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [mode, day, ready, accessToken]);

  useEffect(() => {
    if (mode !== 'replay' || !playing) return;
    const engine = engineRef.current!;
    engine.timeScale = Math.min(speed, 30); // beyond ~30x walking turns into teleporting
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      cursorRef.current += (now - last) * speed;
      last = now;
      while (idxRef.current < events.length && events[idxRef.current].at <= cursorRef.current) {
        feed(events[idxRef.current]);
        idxRef.current++;
      }
      engine.setClock(cursorRef.current);
      setCursor(cursorRef.current);
      if (idxRef.current >= events.length) setPlaying(false);
    }, 100);
    return () => clearInterval(id);
  }, [mode, playing, speed, events, feed]);

  const seek = (to: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.reset();
    setTicker([]);
    cursorRef.current = to;
    let i = 0;
    // Rebuild the store as it stood at `to` without animating the past.
    while (i < events.length && events[i].at <= to) {
      if (to - events[i].at < 30 * 60 * 1000) feed(events[i], true);
      i++;
    }
    idxRef.current = i;
    engine.setClock(to);
    setCursor(to);
  };

  const { from: dayFrom, to: dayTo } = dayBounds(day);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['live', 'LIVE'],
            ['replay', 'REPLAY'],
            ['demo', 'DEMO'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest ${
              mode === m ? 'border-amber text-amber shadow-glow-sm' : 'border-amber/20 text-amber/50 hover:text-amber/80'
            }`}
          >
            {label}
          </button>
        ))}
        <span className={`ml-2 font-mono text-[11px] ${mode === 'demo' ? 'text-info' : 'text-amber/70'}`}>{status}</span>
      </div>

      {mode === 'replay' && (
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-amber/70">
          <input
            type="date"
            value={day}
            max={yesterday()}
            min={new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)}
            onChange={(e) => setDay(e.target.value)}
            className="rounded border border-amber/20 bg-void px-2 py-1 text-amber"
          />
          <button
            disabled={!events.length}
            onClick={() => setPlaying((p) => !p)}
            className="rounded border border-amber px-3 py-1 uppercase tracking-widest text-amber disabled:opacity-30"
          >
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded border px-2 py-1 ${speed === s ? 'border-amber text-amber' : 'border-amber/20 text-amber/50'}`}
            >
              {s}×
            </button>
          ))}
          <input
            type="range"
            min={dayFrom}
            max={dayTo}
            step={60_000}
            value={Math.min(dayTo, Math.max(dayFrom, cursor))}
            disabled={!events.length}
            onChange={(e) => seek(Number(e.target.value))}
            className="min-w-[200px] flex-1 accent-amber"
          />
          <span className="text-amber">{cursor ? new Date(cursor).toLocaleTimeString() : '--:--'}</span>
        </div>
      )}

      <div className="relative">
        <div ref={mountRef} className="hud-panel relative h-[640px] w-full overflow-hidden rounded" />
        {!ready && !loadError && (
          <div className="absolute inset-0 grid place-items-center font-mono text-xs text-amber/60">Building the store…</div>
        )}
        {loadError && (
          <div className="absolute inset-0 grid place-items-center font-mono text-xs text-danger">Store failed to load: {loadError}</div>
        )}

        {/* scoreboard */}
        <div className="pointer-events-none absolute left-3 top-3 flex gap-2">
          {(
            [
              ['In store', stats.inStore],
              ['In aisles', stats.inAisles],
              ['At tills', stats.atTills],
              ['Items in baskets', stats.items],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="rounded border border-amber/30 bg-void/80 px-2.5 py-1.5">
              <div className="font-mono text-[9px] uppercase tracking-widest text-amber/50">{l}</div>
              <div className="font-mono text-lg text-amber text-glow">{v}</div>
            </div>
          ))}
        </div>

        {/* ticker */}
        <div className="pointer-events-none absolute right-3 top-3 w-64 rounded border border-amber/20 bg-void/80 p-2 font-mono text-[10px]">
          <div className="mb-1 uppercase tracking-widest text-amber/50">What&apos;s happening</div>
          {ticker.length === 0 && <div className="text-amber/30">Quiet…</div>}
          {ticker.map((e, i) => (
            <div
              key={`${e.s}-${e.at}-${i}`}
              className={e.t === 'pay_fail' || e.t === 'error' ? 'text-danger' : e.t === 'pay_ok' ? 'text-success' : 'text-amber/80'}
            >
              {flag(e.c)} {STEP_LABEL[e.t]}
              {e.q ? ` “${e.q}”` : ''}
              {e.prod ? ` ${e.prod.replace(/-/g, ' ').slice(0, 26)}` : ''}
              {e.amt ? ` ₦${Math.round(e.amt).toLocaleString()}` : ''}
            </div>
          ))}
        </div>

        {/* hover card */}
        {hover && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded border border-amber/40 bg-void/95 px-3 py-2 font-mono text-[11px] text-amber shadow-panel"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            <div className="text-sm">
              {flag(hover.country)} {hover.country ?? 'Unknown'} · {hover.platform}
            </div>
            <div className="text-amber/70">{hover.step}</div>
            <div className="text-amber/50">
              🧺 {hover.items} item{hover.items === 1 ? '' : 's'}
              {hover.spent ? ` · ${hover.spent}` : ''}
            </div>
          </div>
        )}
      </div>

      <p className="font-mono text-[10px] text-amber/40">
        Drag to rotate · scroll to zoom · right-drag to pan · hover a shopper for details.
        {fallbackCats && ' Using a built-in aisle list (could not reach the category API from here).'} Models: Kenney (CC0).
      </p>
    </div>
  );
}

/** Falls back to a message if WebGL/Three fails, instead of a blank HUD. */
export class StoreGameBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { failed: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.failed ? (
      <p className="p-6 font-mono text-xs text-danger">The 3D store could not start ({this.state.failed}).</p>
    ) : (
      this.props.children
    );
  }
}
