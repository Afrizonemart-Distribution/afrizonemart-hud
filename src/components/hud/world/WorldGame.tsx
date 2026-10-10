'use client';

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { GameCore, money, type HoverInfo, type SceneId } from '@/lib/world/core';
import { CityScene } from '@/lib/world/cityScene';
import { MallScene } from '@/lib/world/mallScene';
import { loadCategories, productInfo, sampleProducts } from '@/lib/storeGame/catalog';
import { startDemo } from '@/lib/storeGame/demo';
import type { CategoryNode, StoreEvent } from '@/lib/storeGame/types';
import { useAuthStore } from '@/stores/authStore';
import { fetchPipeline } from '@/lib/hud/orders';
import { useHudLiveEvents } from '@/lib/hud/useHudLiveEvents';

/**
 * Afrizonemart World — the full-screen game. City map (landmarks,
 * country gates, delivery vans) and a walk-in Mall where every live
 * visit is a character. Game HUD on top: status pill, quest cards,
 * activity feed, location card with shop tabs, bottom nav, replay bar.
 *
 *   LIVE    today so far (counted) + last 30 min (acted out) + the stream
 *   REPLAY  any day in the last 90: play, speed, scrub
 *   DEMO    invented shoppers on the real catalog (labelled)
 *
 * The 3D core owns its render loop; React polls it at 4 Hz.
 */

type Mode = 'live' | 'replay' | 'demo';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SPEEDS = [1, 10, 60, 300];
const ACT_WINDOW = 30 * 60 * 1000; // acted out when seeding/seeking; older is only counted

const STEP: Record<StoreEvent['t'], string> = {
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

function dayStart(day: string): number {
  return new Date(`${day}T00:00:00`).getTime();
}
function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface HudState {
  scene: SceneId;
  inMall: number;
  inShops: number;
  atTills: number;
  items: number;
  byShop: number[];
  visits: number;
  sales: number;
  paid: number;
  failed: number;
  errors: number;
  biggest: number;
  lastFail?: string;
  topShop?: [string, number];
  topSearch?: [string, number];
  topCountry?: [string, number];
  recent: StoreEvent[];
}

export function WorldGame({ initialMode = 'live' }: { initialMode?: Mode } = {}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<GameCore | null>(null);
  const mallRef = useRef<MallScene | null>(null);
  const cityRef = useRef<CityScene | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState('Loading the catalogue…');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [status, setStatus] = useState('');
  const [connected, setConnected] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [feedOpen, setFeedOpen] = useState(true);
  const [clock, setClock] = useState('');
  const accessToken = useAuthStore((s) => s.accessToken);

  // ---- boot ------------------------------------------------------------
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let disposed = false;
    const core = new GameCore(el);
    coreRef.current = core;
    // dev-only handle for debugging / automated screenshots
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __world?: GameCore }).__world = core;
    (async () => {
      const { items } = await loadCategories();
      if (disposed) return;
      setCategories(items);
      setProgress('Building the city…');
      const city = new CityScene();
      await core.add(city);
      cityRef.current = city;
      if (disposed) return;
      setProgress('Opening the mall…');
      const mall = new MallScene(items);
      mall.productInfo = productInfo;
      await core.add(mall);
      mallRef.current = mall;
      if (disposed) return;
      core.start();
      setReady(true);
    })().catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      disposed = true;
      core.dispose();
      coreRef.current = null;
    };
  }, []);

  // ---- poll the game for the HUD (never per frame) -------------------------
  useEffect(() => {
    const id = setInterval(() => {
      const core = coreRef.current;
      const mall = mallRef.current;
      setClock(new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' }));
      if (!core || !mall?.layout) return;
      const L = core.ledger;
      const c = mall.counts();
      const shopName = (slug: string) => mall.layout.shops[mall.layout.shopOf.get(slug) ?? -1]?.name ?? slug;
      const ts = L.top(L.shops, 1)[0];
      setHud({
        scene: core.active,
        ...c,
        visits: L.visits.size,
        sales: L.sales,
        paid: L.paid,
        failed: L.failed,
        errors: L.errors,
        biggest: L.biggest,
        lastFail: L.lastFail?.reason,
        topShop: ts ? [shopName(ts[0]), ts[1]] : undefined,
        topSearch: L.top(L.searches, 1)[0],
        topCountry: L.top(L.byCountry, 1)[0],
        recent: [...L.recent].reverse().slice(0, 12),
      });
      setHover(core.getHover());
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Real orders drive the Warehouse / Depot; real shipments send vans.
  useEffect(() => {
    if (!ready) return;
    const city = cityRef.current;
    if (city) city.vanOnSale = mode === 'demo';
    if (mode === 'demo') return;
    const load = () => fetchPipeline(30).then((p) => cityRef.current?.setOrders(p)).catch(() => undefined);
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [ready, mode]);
  const modeRef = useRef(mode);
  modeRef.current = mode; // the live-events hook keeps its first callback, so read mode via a ref
  useHudLiveEvents((e) => {
    if (modeRef.current === 'demo') return;
    if (e.event === 'order.shipped') cityRef.current?.sendVan(e.country);
    if (e.event.startsWith('order.')) void fetchPipeline(30).then((p) => cityRef.current?.setOrders(p)).catch(() => undefined);
  });

  const act = useCallback((e: StoreEvent, instant = false) => coreRef.current?.apply(e, instant), []);

  /** Seed the game with a window of events: count all, act out the recent ones. */
  const seed = useCallback(
    (events: StoreEvent[], upTo: number) => {
      const core = coreRef.current;
      if (!core) return 0;
      core.reset();
      let i = 0;
      for (; i < events.length && events[i].at <= upTo; i++) {
        if (upTo - events[i].at < ACT_WINDOW) act(events[i], true);
        else core.tally(events[i]);
      }
      core.now = upTo;
      return i;
    },
    [act],
  );

  const fetchWindow = useCallback(
    async (from: number, to: number) => {
      const r = await fetch(
        `${API}/api/hud/store/replay?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}&token=${encodeURIComponent(accessToken ?? '')}`,
      );
      if (r.status === 403) throw new Error('Only you can watch real shoppers — your account must be in STORE_GAME_VIEWER_IDS.');
      if (!r.ok) throw new Error(`Couldn't load (${r.status}). Needs afrizonemart-api#128 deployed.`);
      return (await r.json()) as { items: StoreEvent[]; truncated: boolean };
    },
    [accessToken],
  );

  // ---- LIVE / DEMO -------------------------------------------------------
  useEffect(() => {
    const core = coreRef.current;
    if (!ready || !core || mode === 'replay') return;
    core.reset();
    core.timeScale = 1;
    setConnected(false);
    const tick = setInterval(() => (core.now = Date.now()), 1000);

    if (mode === 'demo') {
      setStatus('DEMO · invented shoppers on the real catalogue');
      setConnected(true);
      let stop = () => {};
      let cancelled = false;
      sampleProducts().then((products) => {
        if (!cancelled) stop = startDemo(categories, products, (e) => act(e), 16);
      });
      return () => {
        cancelled = true;
        stop();
        clearInterval(tick);
      };
    }

    if (!accessToken) {
      setStatus('Sign in again to watch live');
      return () => clearInterval(tick);
    }
    let es: EventSource | null = null;
    let cancelled = false;
    setStatus('Loading today…');
    const now = Date.now();
    fetchWindow(dayStart(isoDay(now)), now)
      .then((body) => {
        if (cancelled) return;
        seed(body.items, now);
      })
      .catch((e) => !cancelled && setStatus(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (cancelled) return;
        es = new EventSource(`${API}/api/hud/store/stream?token=${encodeURIComponent(accessToken)}`);
        es.onopen = () => {
          setConnected(true);
          setStatus('LIVE');
        };
        es.onerror = () => {
          setConnected(false);
          setStatus('Not connected to live shoppers');
        };
        es.onmessage = (m) => {
          try {
            act(JSON.parse(m.data) as StoreEvent);
          } catch {
            /* malformed frame */
          }
        };
      });
    return () => {
      cancelled = true;
      es?.close();
      clearInterval(tick);
    };
  }, [ready, mode, accessToken, categories, act, seed, fetchWindow]);

  // ---- REPLAY ----------------------------------------------------------------
  const [day, setDay] = useState(isoDay(Date.now() - 864e5));
  const [events, setEvents] = useState<StoreEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const cursorRef = useRef(0);
  const idxRef = useRef(0);

  useEffect(() => {
    const core = coreRef.current;
    if (mode !== 'replay' || !ready || !core) return;
    core.reset();
    setPlaying(false);
    setEvents([]);
    setConnected(false);
    const from = dayStart(day);
    setStatus(`Loading ${day}…`);
    let cancelled = false;
    fetchWindow(from, from + 864e5)
      .then((body) => {
        if (cancelled) return;
        setEvents(body.items);
        const first = body.items[0]?.at ?? from;
        cursorRef.current = first - 3000;
        idxRef.current = 0;
        setCursor(cursorRef.current);
        setConnected(true);
        const visits = new Set(body.items.map((e) => e.s)).size;
        setStatus(body.items.length ? `REPLAY · ${visits.toLocaleString()} visits` : 'REPLAY · nobody visited that day');
      })
      .catch((e) => !cancelled && setStatus(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [mode, day, ready, fetchWindow]);

  useEffect(() => {
    const core = coreRef.current;
    if (mode !== 'replay' || !playing || !core) return;
    core.timeScale = Math.min(speed, 30);
    let last = performance.now();
    const id = setInterval(() => {
      const t = performance.now();
      cursorRef.current += (t - last) * speed;
      last = t;
      while (idxRef.current < events.length && events[idxRef.current].at <= cursorRef.current) {
        act(events[idxRef.current]);
        idxRef.current++;
      }
      core.now = cursorRef.current;
      setCursor(cursorRef.current);
      if (idxRef.current >= events.length) setPlaying(false);
    }, 100);
    return () => clearInterval(id);
  }, [mode, playing, speed, events, act]);

  const seek = (to: number) => {
    cursorRef.current = to;
    idxRef.current = seed(events, to);
    setCursor(to);
  };

  const go = (id: SceneId, focus?: THREE.Vector3) => coreRef.current?.go(id, false, focus);
  const goShop = (i: number) => {
    const s = mallRef.current?.layout.shops[i];
    if (s) go('mall', new THREE.Vector3(s.cx, 0, (s.zOpen + s.zWall) / 2));
  };

  const fullscreen = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const h = hud;
  const shops = mallRef.current?.layout?.shops ?? [];
  const from = dayStart(day);

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[#bfe3ff] font-raleway text-[#0a0f3d]">
      <div ref={mountRef} className="absolute inset-0" />

      {/* loading */}
      {(!ready || loadError) && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#050614]">
          <div className="text-center">
            <div className="font-raleway text-3xl font-bold text-amber text-glow">AFRIZONEMART WORLD</div>
            <div className={`mt-3 font-mono text-xs ${loadError ? 'text-danger' : 'animate-blink text-amber/70'}`}>
              {loadError ? `Couldn't start: ${loadError}` : progress}
            </div>
          </div>
        </div>
      )}

      {/* top status pill */}
      <div className="wg-pill absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 px-4 py-1.5 text-[12px]">
        <span>🕐 {clock} Lagos</span>
        <span className="opacity-30">|</span>
        <span className={`font-bold ${connected ? (mode === 'demo' ? 'text-sky-600' : 'text-emerald-600') : 'text-rose-500'}`}>
          ● {mode === 'live' ? 'LIVE' : mode === 'replay' ? 'REPLAY' : 'DEMO'}
        </span>
        <span>🧍 {h?.inMall ?? 0} in the mall</span>
        <span>👣 {h?.visits ?? 0} visits</span>
        <span className="font-bold">{money(h?.sales ?? 0, 'NGN')}</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-[11px]"
          aria-label="Data source"
        >
          <option value="live">Live</option>
          <option value="replay">Replay a day</option>
          <option value="demo">Demo</option>
        </select>
      </div>
      {status && status !== 'LIVE' && (
        <div className="absolute left-1/2 top-14 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] shadow">
          <span>{status}</span>
          {mode === 'live' && !connected && (
            <button onClick={() => setMode('demo')} className="rounded-full bg-[#000066] px-2 py-0.5 font-bold text-amber">
              ▶ Play demo
            </button>
          )}
        </div>
      )}

      {/* top-right controls */}
      <div className="absolute right-3 top-3 z-20 flex gap-2">
        <button onClick={fullscreen} className="wg-pill px-3 py-1.5 text-[12px]" title="Full screen">
          ⛶
        </button>
        <Link href="/" className="wg-pill px-3 py-1.5 text-[12px]">
          ✕ Exit
        </Link>
      </div>

      {/* quest cards */}
      <div className="absolute left-3 top-16 z-20 flex w-60 flex-col gap-2">
        <Quest icon="💸" title={`${money(h?.sales ?? 0, 'NGN')} sales today`} sub={`${h?.paid ?? 0} paid orders`} tone="good" />
        {!!h?.failed && <Quest icon="✖" title={`${h.failed} payment${h.failed === 1 ? '' : 's'} failed`} sub={h.lastFail ?? ''} tone="bad" />}
        {!!h?.errors && <Quest icon="⚠" title={`${h.errors} server error${h.errors === 1 ? '' : 's'}`} sub="See the Server Tower" tone="bad" />}
        {h?.topShop && <Quest icon="🔥" title={`Busiest: ${h.topShop[0]}`} sub={`${h.topShop[1]} visits`} />}
        {h?.topSearch && <Quest icon="🔍" title={`Top search: “${h.topSearch[0]}”`} sub={`${h.topSearch[1]} times`} />}
        {!!h?.biggest && <Quest icon="🏆" title={`Biggest basket ${money(h.biggest, 'NGN')}`} sub="today" />}
        {h?.topCountry && <Quest icon={<Flag cc={h.topCountry[0]} h={16} />} title={`Top country: ${h.topCountry[0]}`} sub={`${h.topCountry[1]} visitors`} />}
      </div>

      {/* activity feed */}
      <div className="absolute right-3 top-16 z-20 w-64">
        <button onClick={() => setFeedOpen((o) => !o)} className="wg-pill mb-2 w-full px-3 py-1 text-left text-[11px] font-bold">
          {feedOpen ? '▾' : '▸'} What&apos;s happening
        </button>
        {feedOpen && (
          <div className="wg-card max-h-[46vh] overflow-hidden p-2 text-[11px]">
            {!h?.recent.length && <div className="opacity-50">Quiet right now…</div>}
            {h?.recent.map((e, i) => (
              <div
                key={`${e.s}${e.at}${i}`}
                className={`truncate py-0.5 ${e.t === 'pay_fail' || e.t === 'error' ? 'text-rose-600' : e.t === 'pay_ok' ? 'text-emerald-700' : ''}`}
              >
                <Flag cc={e.c} /> {STEP[e.t]}
                {e.q ? ` “${e.q}”` : ''}
                {e.prod ? ` ${e.prod.replace(/-/g, ' ')}` : ''}
                {e.amt ? ` ${money(e.amt, e.cur)}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* hover card */}
      {hover && (
        <div
          className="wg-card pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full px-3 py-2 text-[12px]"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          <div className="font-bold">{hover.title}</div>
          {hover.lines.map((l, i) => (
            <div key={i} className="opacity-75">
              {l}
            </div>
          ))}
          {hover.action && <div className="mt-1 font-bold text-[#000066]">👆 Click: {hover.action.label}</div>}
        </div>
      )}

      {/* location card */}
      <div className="absolute bottom-24 left-1/2 z-20 w-[min(760px,92vw)] -translate-x-1/2">
        {mode === 'replay' && (
          <div className="wg-card mb-2 flex flex-wrap items-center gap-2 px-3 py-2 text-[11px]">
            <input
              type="date"
              value={day}
              max={isoDay(Date.now() - 864e5)}
              min={isoDay(Date.now() - 90 * 864e5)}
              onChange={(e) => setDay(e.target.value)}
              className="rounded border border-black/10 px-1"
            />
            <button disabled={!events.length} onClick={() => setPlaying((p) => !p)} className="rounded-full bg-[#000066] px-3 py-0.5 font-bold text-amber disabled:opacity-30">
              {playing ? '❚❚' : '▶'}
            </button>
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`rounded-full px-2 py-0.5 ${speed === s ? 'bg-amber font-bold' : 'bg-black/5'}`}>
                {s}×
              </button>
            ))}
            <input
              type="range"
              min={from}
              max={from + 864e5}
              step={60_000}
              value={Math.min(from + 864e5, Math.max(from, cursor))}
              disabled={!events.length}
              onChange={(e) => seek(Number(e.target.value))}
              className="min-w-[160px] flex-1 accent-[#000066]"
            />
            <span className="font-mono">{cursor ? new Date(cursor).toLocaleTimeString('en-GB') : '--:--'}</span>
          </div>
        )}
        {h?.scene === 'mall' ? (
          <div className="wg-card px-3 py-2">
            <div className="flex items-center justify-between text-[12px]">
              <span>
                🛍 <b>Afrizonemart Mall</b> · {h.inMall} shoppers · {h.inShops} in shops · {h.atTills} at the Pay Point · 🧺 {h.items} items
              </span>
            </div>
            <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5 text-[11px]">
              <button onClick={() => go('mall')} className="shrink-0 rounded-full bg-black/5 px-2.5 py-0.5">
                ⛲ Atrium
              </button>
              {shops.map((s, i) => (
                <button key={s.slug} onClick={() => goShop(i)} className="shrink-0 rounded-full bg-black/5 px-2.5 py-0.5 hover:bg-amber/40">
                  {s.name} <b>{h.byShop[i] || ''}</b>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="wg-card px-3 py-2 text-[12px]">
            🏙 <b>Afrizonemart City</b> · shoppers arrive through their country&apos;s gate and walk to the Mall. Tap a building to go in.
          </div>
        )}
      </div>

      {/* bottom nav */}
      <nav className="wg-pill absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-1 p-1 text-[12px]">
        <NavBtn active={h?.scene === 'city'} onClick={() => go('city')} icon="🏙" label="City" />
        <NavBtn active={h?.scene === 'mall'} onClick={() => go('mall')} icon="🛍" label="Mall" />
        <Link href="/arcade" className="flex flex-col items-center rounded-full px-4 py-1 hover:bg-black/5">
          <span>⚙️</span>
          <span className="text-[10px]">Back room</span>
        </Link>
        <NavBtn active={mode === 'replay'} onClick={() => setMode(mode === 'replay' ? 'live' : 'replay')} icon="⏪" label="Replay" />
      </nav>

      <div className="absolute bottom-1 right-3 z-10 text-[9px] opacity-50">
        drag = pan · right-drag = rotate · scroll = zoom · models by Kenney (CC0)
      </div>
    </div>
  );
}

function Quest({ icon, title, sub, tone }: { icon: ReactNode; title: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`wg-card flex items-center gap-2 px-2.5 py-1.5 ${tone === 'bad' ? 'ring-1 ring-rose-400' : ''}`}>
      <span className="text-lg">{icon}</span>
      <div className="min-w-0">
        <div className={`truncate text-[12px] font-bold ${tone === 'bad' ? 'text-rose-600' : ''}`}>{title}</div>
        {sub && <div className="truncate text-[10px] opacity-60">{sub}</div>}
      </div>
    </div>
  );
}

/** Flag image — Windows browsers can't draw flag emoji. */
function Flag({ cc, h = 11 }: { cc?: string | null; h?: number }) {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return <span>🌍</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://flagcdn.com/h20/${cc.toLowerCase()}.png`} alt={cc.toUpperCase()} style={{ height: h }} className="inline-block rounded-[2px] align-[-1px]" />;
}

function NavBtn({ active, onClick, icon, label }: { active?: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center rounded-full px-4 py-1 ${active ? 'bg-[#000066] text-amber' : 'hover:bg-black/5'}`}>
      <span>{icon}</span>
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

export class WorldBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { failed: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.failed ? (
      <p className="p-6 font-mono text-xs text-danger">Afrizonemart World could not start ({this.state.failed}).</p>
    ) : (
      this.props.children
    );
  }
}
