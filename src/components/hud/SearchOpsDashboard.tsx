'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  fetchSearchStats,
  fetchSearchTimeseries,
  type SearchStats,
  type SearchTimeseriesBucket,
} from '@/lib/api/adminSearch';
import { HttpApiError } from '@/lib/api/client';
import { HologramGlobe } from './HologramGlobe';
import { OpsPanel } from './charts/OpsPanel';
import { Donut } from './charts/Donut';
import { RankedBars } from './charts/RankedBars';
import { TrendChart } from './charts/TrendChart';
import { KpiTile } from './charts/KpiTile';
import { MiniTable } from './charts/MiniTable';
import { Histogram } from './charts/Histogram';

const RED = '#FF4D4D';
const STATS_WINDOW_DAYS = 7;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function LatencyBars({ latencyMs }: { latencyMs: SearchStats['latencyMs'] }) {
  if (!latencyMs) return <p className="font-mono text-[10px] text-amber/30">No timed queries yet.</p>;
  const max = Math.max(latencyMs.p99, 1);
  const rows: Array<[string, number]> = [
    ['p50', latencyMs.p50],
    ['p95', latencyMs.p95],
    ['p99', latencyMs.p99],
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([label, ms]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-7 font-mono text-[9px] uppercase text-danger/50">{label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-danger/10">
            <div className="h-full rounded-full bg-danger" style={{ width: `${(ms / max) * 100}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-[9px] text-danger">{ms}ms</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Search & Discovery's ops dashboard — applies the Alibaba DataV
 * reference image close to as-is: a dense 3-column grid of small
 * bordered panels framing one central hero visualization, red
 * accent throughout. Every panel is real data from
 * GET /api/admin/search/{stats,timeseries} — nothing here is mocked.
 */
export function SearchOpsDashboard() {
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [daily, setDaily] = useState<SearchTimeseriesBucket[]>([]);
  const [hourly, setHourly] = useState<SearchTimeseriesBucket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchSearchStats(STATS_WINDOW_DAYS),
      fetchSearchTimeseries('day', 30),
      fetchSearchTimeseries('hour', 24),
    ])
      .then(([s, d, h]) => {
        setStats(s);
        setDaily(d);
        setHourly(h);
      })
      .catch((err) => setError(err instanceof HttpApiError ? err.message : 'Failed to load search stats.'));
  }, []);

  if (error) {
    return (
      <div className="ops-corners ops-panel flex items-center gap-3 p-4 text-danger">
        <AlertTriangle size={16} aria-hidden />
        <span className="font-mono text-xs">{error}</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="ops-corners ops-panel p-8 text-center font-mono text-xs uppercase tracking-widest text-danger/40 animate-blink">
        Loading search stats…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr_280px]">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          <OpsPanel title="Query Script Mix">
            <Donut
              data={stats.scriptDistribution.map((s) => ({ label: s.script, value: s.count }))}
              centerValue={String(stats.totalQueries)}
              centerLabel={`${STATS_WINDOW_DAYS}D QUERIES`}
            />
          </OpsPanel>
          <OpsPanel title="Top Queries">
            <RankedBars items={stats.topQueries.slice(0, 6).map((q) => ({ label: q.normalizedQuery, value: q.count }))} />
          </OpsPanel>
          <OpsPanel title="30-Day Search Volume" className="flex-1">
            <TrendChart data={daily.map((d) => d.totalQueries)} />
          </OpsPanel>
        </div>

        {/* Center — the live hero visualization */}
        <div className="flex flex-col gap-3">
          <OpsPanel title="Live Search Activity — Africa" className="flex-1">
            <HologramGlobe accent={RED} compact eventFilter={(e) => e.event === 'search.performed'} />
          </OpsPanel>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3">
          <OpsPanel title="24-Hour Search Activity">
            <TrendChart data={hourly.map((h) => h.totalQueries)} />
          </OpsPanel>
          <OpsPanel title="Latency (ms)">
            <LatencyBars latencyMs={stats.latencyMs} />
          </OpsPanel>
          <OpsPanel title="Top Zero-Result Queries" className="flex-1">
            <MiniTable
              columns={[
                { key: 'q', label: 'Query' },
                { key: 'n', label: 'Count' },
              ]}
              rows={stats.topZeroResultQueries.slice(0, 6).map((q) => ({ q: q.normalizedQuery, n: q.count }))}
            />
          </OpsPanel>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_repeat(4,minmax(0,140px))]">
        <OpsPanel title="Searches by Country">
          <Histogram data={stats.topCountries.map((c) => ({ label: c.country, value: c.count }))} />
        </OpsPanel>
        <KpiTile label={`${STATS_WINDOW_DAYS}D Searches`} value={String(stats.totalQueries)} />
        <KpiTile label="Zero-Result Rate" value={pct(stats.zeroResultRate)} />
        <KpiTile label="Fallback Rate" value={pct(stats.fallbackRate)} />
        <KpiTile label="Did-You-Mean Rate" value={pct(stats.didYouMeanRate)} />
      </div>
    </div>
  );
}
