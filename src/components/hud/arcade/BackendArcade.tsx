'use client';

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArcadeCanvas, type ArenaHover } from './ArcadeCanvas';
import { AdvisorPanel } from '@/components/hud/common/AdvisorPanel';
import { Explain, ExplainProvider, useExplain } from '@/components/hud/common/Explain';
import { advise } from '@/lib/hud/advisor';
import { EXPLAIN, explainParticle } from '@/lib/hud/explain';
import { PulseSim } from '@/lib/hud/pulseSim';
import { LIMITS, passes, type PulseSnapshot } from '@/lib/hud/pulseTypes';
import { usePulse, type PulseSource } from '@/lib/hud/usePulse';

/**
 * Backend Arcade — the whole API as a live game level, built to watch
 * the k6 "$12 server" experiment happen: shoppers pile in, latency
 * climbs, the p95 crosses 500 ms, then the 1 s cache goes on and the
 * same box holds far more players.
 *
 * Sources: LIVE (this HUD's API, real shoppers), STAGING (the loadtest
 * copy while k6 runs, via its HUD_PULSE_KEY), SIM (a labelled model so
 * the experiment can be replayed any time).
 */

const STAGES_BASELINE = [10, 50, 100, 1000, 2000, 2500, 3000];
const STAGES_CACHE = [2500, 3000, 3500, 4000, 4500, 5000, 5500];
const HOLD_MS = 6000;

interface StageResult {
  run: 'baseline' | 'cache';
  players: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  cpu: number;
  err: number;
  pass: boolean;
}

const STORE_KEY = 'hud.arcade.staging';
function readStaging(): { url: string; key: string } {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage blocked — start empty */
  }
  return { url: '', key: '' };
}
function saveStaging(v: { url: string; key: string }) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    /* storage blocked — fine, just not remembered */
  }
}

function average(frames: PulseSnapshot[], run: StageResult['run'], players: number): StageResult {
  const n = Math.max(1, frames.length);
  const avg = (f: (s: PulseSnapshot) => number) => Math.round((frames.reduce((a, s) => a + f(s), 0) / n) * 10) / 10;
  const r = {
    run,
    players,
    rps: avg((s) => s.rps),
    p50: avg((s) => s.lat.p50),
    p95: avg((s) => s.lat.p95),
    p99: avg((s) => s.lat.p99),
    cpu: avg((s) => s.cpu.pct),
    err: avg((s) => s.errors.rate),
  };
  return { ...r, pass: passes({ lat: { p50: r.p50, p95: r.p95, p99: r.p99, max: 0 }, errors: { rate: r.err, s5xx: 0, s4xx: 0 } }) };
}

export function BackendArcade() {
  const sim = useMemo(() => new PulseSim(), []);
  const [mode, setMode] = useState<PulseSource['mode']>('sim');
  const [staging, setStaging] = useState({ url: '', key: '' });
  const [stagingDraft, setStagingDraft] = useState({ url: '', key: '' });
  useEffect(() => {
    const v = readStaging();
    setStaging(v);
    setStagingDraft(v);
  }, []);

  const source: PulseSource = mode === 'staging' ? { mode, ...staging } : { mode };
  const { snap, history, connected, incoming } = usePulse(source, sim);

  // ---- SIM controls ----------------------------------------------------
  const [players, setPlayers] = useState(100);
  const [cacheOn, setCacheOn] = useState(false);
  useEffect(() => {
    sim.players = players;
    sim.cacheOn = cacheOn;
  }, [sim, players, cacheOn]);

  // ---- experiment (SIM: automatic; LIVE/STAGING: record stages by hand) --
  const [results, setResults] = useState<StageResult[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const cancelRef = useRef(false);

  const runExperiment = async () => {
    cancelRef.current = false;
    setResults([]);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const [run, stages, cache] of [
      ['baseline', STAGES_BASELINE, false],
      ['cache', STAGES_CACHE, true],
    ] as const) {
      setCacheOn(cache);
      for (const p of stages) {
        if (cancelRef.current) return setRunning(null);
        setRunning(`${run === 'baseline' ? 'Baseline' : '+ 1 s cache'} · ${p.toLocaleString()} players`);
        sim.reset();
        setPlayers(p);
        await sleep(HOLD_MS);
        const res = average(historyRef.current.slice(-4), run, p);
        setResults((r) => [...r, res]);
        if (!res.pass) break; // like the video: back off once it fails
      }
    }
    setRunning(null);
  };

  const recordStage = () => {
    if (!snap) return;
    const p = snap.players.loadtest || snap.players.shoppers;
    setResults((r) => [...r, average(history.slice(-10), snap.cache.ttlMs > 0 ? 'cache' : 'baseline', p)]);
  };

  const best = (run: StageResult['run']) =>
    Math.max(0, ...results.filter((r) => r.run === run && r.pass).map((r) => r.players));

  const s = snap;
  const playersNow = s ? s.players.loadtest || s.players.shoppers : 0;
  const ok = s ? passes(s) : true;
  const advice = useMemo(() => advise(snap, history, mode), [snap, history, mode]);

  return (
    <ExplainProvider registry={EXPLAIN} ctx={snap}>
    <div className="flex flex-col gap-4">
      {/* source picker */}
      <Explain k="source">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['live', 'LIVE · prod'],
            ['staging', 'STAGING · k6'],
            ['sim', 'SIM · video replay'],
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
        <span className={`ml-2 font-mono text-[11px] ${connected ? 'text-success' : 'text-danger'}`}>
          ● {connected ? 'connected' : mode === 'live' ? 'connecting… (needs api#127 deployed)' : 'not connected'}
        </span>
      </div>

      </Explain>
      <p className="-mt-2 font-mono text-[10px] text-amber/40">New here? Hover over anything — every number, line and part of the arena explains itself.</p>

      {mode === 'sim' && (
        <div className="rounded border border-info/40 bg-info/5 px-3 py-2 font-mono text-[11px] text-info">
          SIMULATED — a model of one 1-vCPU API box shaped on the k6 video, not a measurement of Afrizonemart. Use
          STAGING for real numbers.
        </div>
      )}

      {mode === 'staging' && (
        <form
          className="flex flex-wrap items-end gap-2 font-mono text-[11px]"
          onSubmit={(e) => {
            e.preventDefault();
            setStaging(stagingDraft);
            saveStaging(stagingDraft);
          }}
        >
          <label className="flex flex-col gap-1 text-amber/60">
            Loadtest API URL
            <input
              value={stagingDraft.url}
              onChange={(e) => setStagingDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder="https://api-loadtest.up.railway.app"
              className="w-80 rounded border border-amber/20 bg-void px-2 py-1 text-amber"
            />
          </label>
          <label className="flex flex-col gap-1 text-amber/60">
            HUD_PULSE_KEY
            <input
              type="password"
              value={stagingDraft.key}
              onChange={(e) => setStagingDraft((d) => ({ ...d, key: e.target.value }))}
              className="w-64 rounded border border-amber/20 bg-void px-2 py-1 text-amber"
            />
          </label>
          <button className="rounded border border-amber px-3 py-1.5 uppercase tracking-widest text-amber">Connect</button>
        </form>
      )}

      {/* scoreboard */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi k="shoppers" label="Players online" value={playersNow.toLocaleString()} sub={s?.players.loadtest ? 'k6 virtual users' : 'shoppers, last 60 s'} />
        <Kpi k="rps" label="Throughput" value={s ? `${s.rps}` : '—'} sub="req / s" />
        <Kpi k="p50" label="p50" value={s ? `${s.lat.p50}` : '—'} sub="ms median" />
        <Kpi k="p95" label="p95" value={s ? `${s.lat.p95}` : '—'} sub={`ms · limit ${LIMITS.p95}`} bad={!!s && s.lat.p95 >= LIMITS.p95} />
        <Kpi k="p99" label="p99" value={s ? `${s.lat.p99}` : '—'} sub={`ms · limit ${LIMITS.p99}`} bad={!!s && s.lat.p99 >= LIMITS.p99} />
        <Kpi k="errors" label="Errors" value={s ? `${s.errors.rate}%` : '—'} sub={`limit ${LIMITS.errorPct}%`} bad={!!s && s.errors.rate >= LIMITS.errorPct} />
        <Kpi k="cpu" label="CPU" value={s ? `${s.cpu.pct}%` : '—'} sub={s ? `${s.cpu.cores} core${s.cpu.cores === 1 ? '' : 's'} · lag ${s.loopLagMs} ms` : ''} bad={!!s && s.cpu.pct >= 85} />
        <Kpi k="cachehit" label="Cache hit" value={s ? (s.cache.ttlMs ? `${s.cache.hitRate}%` : 'off') : '—'} sub={s ? `DB ${s.db.qps} q/s` : ''} />
      </div>

      <AdvisorPanel advice={advice} note={mode === 'sim' ? '(practice numbers from SIM)' : undefined} />

      {/* arena */}
      <div className="hud-panel hud-corners relative overflow-hidden">
        <Explain k="passfail" className="absolute right-3 top-3 z-10">
        <div
          className={`rounded border px-3 py-1 font-mono text-xs font-bold tracking-widest ${
            ok ? 'border-success text-success' : 'border-danger text-danger text-glow-red'
          }`}
        >
          {s ? (ok ? 'PASS' : 'FAIL') : 'WAITING'}
        </div>
        </Explain>
        <SafeBoundary fallback={<p className="p-6 font-mono text-xs text-amber/60">Arena failed to draw — numbers above are still live.</p>}>
          <ArenaCanvas incoming={incoming} snap={snap} />
        </SafeBoundary>
        <div className="flex flex-wrap gap-4 px-4 pb-3 font-mono text-[10px] text-amber/50">
          <span><b className="text-success">●</b> &lt; 100 ms</span>
          <span><b className="text-amber">●</b> 100–500 ms</span>
          <span><b className="text-danger">●</b> ≥ 500 ms or failed</span>
          <span><b className="text-info">◖</b> bounced off the cache</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="hud-panel p-4">
          <Explain k="chart"><h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber/60">Last 60 s — p95 vs the 500 ms limit ⓘ</h3></Explain>
          <LatencyChart history={history} />
        </div>

        <div className="hud-panel flex flex-col gap-3 p-4">
          <Explain k="experiment"><h3 className="font-mono text-[10px] uppercase tracking-widest text-amber/60">The experiment ⓘ</h3></Explain>
          {mode === 'sim' ? (
            <>
              <label className="font-mono text-[11px] text-amber/70">
                Players: <b className="text-amber">{players.toLocaleString()}</b>
                <input
                  type="range"
                  min={10}
                  max={6000}
                  step={10}
                  value={players}
                  disabled={!!running}
                  onChange={(e) => setPlayers(Number(e.target.value))}
                  className="mt-1 w-full accent-amber"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={!!running}
                  onClick={() => setCacheOn((c) => !c)}
                  className={`rounded border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest ${cacheOn ? 'border-info text-info' : 'border-amber/30 text-amber/60'}`}
                >
                  1 s cache: {cacheOn ? 'on' : 'off'}
                </button>
                {running ? (
                  <button
                    onClick={() => (cancelRef.current = true)}
                    className="rounded border border-danger px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-danger"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => void runExperiment()}
                    className="rounded border border-amber bg-amber/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-amber shadow-glow-sm"
                  >
                    ▶ Run the video&apos;s experiment
                  </button>
                )}
              </div>
              {running && <p className="animate-blink font-mono text-[11px] text-amber">Running: {running}</p>}
            </>
          ) : (
            <div className="flex flex-col gap-2 font-mono text-[11px] text-amber/70">
              <p>Start k6 on the loadtest service. When each stage settles, record it.</p>
              <button onClick={recordStage} disabled={!snap} className="self-start rounded border border-amber px-3 py-1.5 uppercase tracking-widest text-amber">
                ● Record this stage
              </button>
            </div>
          )}

          <Results results={results} best={best} />
        </div>
      </div>
    </div>
    </ExplainProvider>
  );
}

function Kpi({ k, label, value, sub, bad }: { k: string; label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <Explain k={k}>
    <div className={`hud-panel px-3 py-2 ${bad ? 'border-danger/60' : ''}`}>
      <div className="font-mono text-[9px] uppercase tracking-widest text-amber/50">{label}</div>
      <div className={`font-mono text-xl ${bad ? 'text-danger text-glow-red' : 'text-amber text-glow'}`}>{value}</div>
      {sub && <div className="font-mono text-[9px] text-amber/40">{sub}</div>}
    </div>
    </Explain>
  );
}

/** Canvas hover -> explain popup. */
function ArenaCanvas(props: Omit<Parameters<typeof ArcadeCanvas>[0], 'onHover'>) {
  const { show } = useExplain();
  const onHover = (h: ArenaHover | null, x: number, y: number) => {
    if (!h) return show(null, 0, 0);
    show(h.kind === 'dot' ? explainParticle(h.p) : EXPLAIN[h.key], x, y);
  };
  return <ArcadeCanvas {...props} onHover={onHover} />;
}

function Results({ results, best }: { results: StageResult[]; best: (r: StageResult['run']) => number }) {
  if (!results.length) return <p className="font-mono text-[11px] text-amber/40">No stages recorded yet.</p>;
  const b = best('baseline');
  const c = best('cache');
  const max = Math.max(1, b, c);
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full font-mono text-[10px]">
        <thead className="text-amber/50">
          <tr>
            <th className="text-left">run</th>
            <th className="text-right">players</th>
            <th className="text-right">req/s</th>
            <th className="text-right">p50</th>
            <th className="text-right">p95</th>
            <th className="text-right">p99</th>
            <th className="text-right">cpu</th>
            <th className="text-right" />
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className={r.pass ? 'text-amber/80' : 'text-danger'}>
              <td>{r.run === 'cache' ? '+ cache' : 'baseline'}</td>
              <td className="text-right">{r.players.toLocaleString()}</td>
              <td className="text-right">{r.rps}</td>
              <td className="text-right">{r.p50}</td>
              <td className="text-right">{r.p95}</td>
              <td className="text-right">{r.p99}</td>
              <td className="text-right">{r.cpu}%</td>
              <td className="text-right font-bold">{r.pass ? 'PASS' : 'FAIL'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-end gap-6">
        {(
          [
            ['baseline', b, 'bg-amber/40'],
            ['+ 1 s cache', c, 'bg-amber'],
          ] as const
        ).map(([label, v, cls]) => (
          <div key={label} className="flex flex-col items-center gap-1 font-mono text-[10px]">
            <span className="text-amber">{v ? v.toLocaleString() : '—'}</span>
            <div className={`w-14 ${cls}`} style={{ height: `${Math.max(4, (v / max) * 90)}px` }} />
            <span className="text-amber/50">{label}</span>
          </div>
        ))}
        {b > 0 && c > 0 && (
          <span className="pb-6 font-mono text-[11px] text-success">+{Math.round(((c - b) / b) * 100)}% players, same box</span>
        )}
      </div>
    </div>
  );
}

function LatencyChart({ history }: { history: PulseSnapshot[] }) {
  const W = 600;
  const H = 160;
  if (history.length < 2) return <p className="font-mono text-[11px] text-amber/40">Waiting for data…</p>;
  const top = Math.max(LIMITS.p95 * 1.4, ...history.map((s) => Math.min(s.lat.p95, 5000)));
  const y = (v: number) => H - (Math.min(v, top) / top) * H;
  const x = (i: number) => (i / (120 - 1)) * W;
  const line = (f: (s: PulseSnapshot) => number) => history.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(f(s))}`).join(' ');
  const maxRps = Math.max(1, ...history.map((s) => s.rps));
  const rps = history.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${H - (s.rps / maxRps) * H * 0.9}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none">
      <path d={rps} fill="none" stroke="rgba(77,216,255,0.35)" strokeWidth={1} />
      <line x1={0} x2={W} y1={y(LIMITS.p95)} y2={y(LIMITS.p95)} stroke="#FF4D4D" strokeDasharray="6 4" strokeWidth={1} />
      <text x={W - 4} y={y(LIMITS.p95) - 4} textAnchor="end" fill="#FF4D4D" fontSize={10} fontFamily="monospace">
        500 ms limit
      </text>
      <path d={line((s) => s.lat.p50)} fill="none" stroke="#3DDC97" strokeWidth={1.5} />
      <path d={line((s) => s.lat.p95)} fill="none" stroke="#FBAC34" strokeWidth={2} />
      <text x={4} y={12} fill="#FBAC34" fontSize={10} fontFamily="monospace">p95</text>
      <text x={34} y={12} fill="#3DDC97" fontSize={10} fontFamily="monospace">p50</text>
      <text x={64} y={12} fill="rgba(77,216,255,0.7)" fontSize={10} fontFamily="monospace">req/s</text>
    </svg>
  );
}

class SafeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
