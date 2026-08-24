'use client';

import { type FormEvent, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Languages,
  Layers,
  Radar,
  Search,
  SpellCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { fetchSearchTrace, type SearchTraceResult, type SearchTraceStage } from '@/lib/api/hud';
import { HttpApiError } from '@/lib/api/client';
import { RouteMap, type RouteNode } from './RouteMap';

const STAGE_META: Record<
  string,
  { label: string; icon: typeof Search; describe: (d: Record<string, unknown>) => string }
> = {
  normalize: {
    label: 'Normalize',
    icon: Sparkles,
    describe: (d) => `script: ${String(d.script ?? 'unknown')}`,
  },
  synonym_expansion: {
    label: 'Synonyms',
    icon: Languages,
    describe: (d) => {
      const applied = (d.synonymsApplied as { token: string; synonyms: string[] }[]) ?? [];
      const hit = applied.filter((a) => a.synonyms.length > 0);
      if (hit.length === 0) return 'no synonym matches';
      return hit.map((h) => `${h.token} → [${h.synonyms.join(', ')}]`).join('  ');
    },
  },
  lexical_search: {
    label: 'Lexical Search',
    icon: Search,
    describe: (d) => `${Number(d.resultCount ?? 0)} match${Number(d.resultCount ?? 0) === 1 ? '' : 'es'}`,
  },
  trigram_fallback: {
    label: 'Fallback',
    icon: Zap,
    describe: (d) => `fired — recovered ${Number(d.resultCount ?? 0)} result(s)`,
  },
  facets: {
    label: 'Facets',
    icon: Layers,
    describe: (d) => (d.facets ? 'computed' : 'unavailable'),
  },
  did_you_mean: {
    label: 'Did You Mean',
    icon: SpellCheck,
    describe: (d) =>
      d.didYouMean ? `suggested: "${String(d.didYouMean)}"` : d.attempted ? 'no better candidate' : 'skipped — healthy result count',
  },
};

function StageRow({ stage, index }: { stage: SearchTraceStage; index: number }) {
  const meta = STAGE_META[stage.name] ?? { label: stage.name, icon: Radar, describe: () => '' };
  const Icon = meta.icon;
  return (
    <li
      className="hud-corners hud-panel flex animate-flicker-in items-start gap-4 p-4"
      style={{ animationDelay: `${index * 90}ms`, animationFillMode: 'backwards' }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-amber/30 text-amber shadow-glow-sm">
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-amber text-glow">
            {String(index + 1).padStart(2, '0')} {'//'} {meta.label}
          </span>
          <span className="shrink-0 font-mono text-xs text-info">{stage.durationMs.toFixed(1)}ms</span>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-amber/50">{meta.describe(stage.detail)}</p>
      </div>
    </li>
  );
}

export function SearchTracePanel() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchTraceResult | null>(null);
  const [runToken, setRunToken] = useState(0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const trace = await fetchSearchTrace(query.trim());
      setResult(trace);
      setRunToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof HttpApiError ? err.message : 'Trace failed.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const routeNodes: RouteNode[] = (result?.stages ?? []).map((stage) => {
    const meta = STAGE_META[stage.name] ?? { label: stage.name, icon: Radar, describe: () => '' };
    return {
      key: stage.name,
      label: meta.label,
      icon: meta.icon,
      detail: meta.describe(stage.detail),
      weightMs: Math.max(stage.durationMs, 5),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="hud-corners hud-panel flex items-center gap-3 p-3">
        <Search size={16} aria-hidden className="ml-2 shrink-0 text-amber/50" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ENTER QUERY_"
          className="flex-1 bg-transparent font-mono text-sm text-amber placeholder:text-amber/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex shrink-0 items-center gap-2 rounded border border-amber bg-amber/10 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-amber shadow-glow-sm transition-all hover:bg-amber/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Tracing…' : 'Run Trace'}
          <ArrowRight size={13} aria-hidden />
        </button>
      </form>

      {error && (
        <div className="hud-corners hud-panel flex items-center gap-3 border-danger/40 p-4 text-danger">
          <AlertTriangle size={16} aria-hidden />
          <span className="font-mono text-xs">{error}</span>
        </div>
      )}

      {result && (
        <>
          <RouteMap nodes={routeNodes} runToken={runToken} />

          <div className="hud-corners hud-panel grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Readout label="Total" value={`${result.totalDurationMs.toFixed(1)}ms`} />
            <Readout label="Results" value={String(result.resultCount)} />
            <Readout
              label="Fallback"
              value={result.usedFallback ? 'FIRED' : 'IDLE'}
              tone={result.usedFallback ? 'warn' : 'ok'}
            />
            <Readout
              label="Did You Mean"
              value={result.didYouMean ?? '—'}
              tone={result.didYouMean ? 'warn' : 'ok'}
            />
          </div>

          <ol className="flex flex-col gap-3">
            {result.stages.map((stage, i) => (
              <StageRow key={stage.name} stage={stage} index={i} />
            ))}
          </ol>

          <div className="flex items-center gap-2 font-mono text-[11px] text-amber/40">
            <CheckCircle2 size={12} aria-hidden className="text-success" />
            trace complete — {result.stages.length} stage{result.stages.length === 1 ? '' : 's'} captured
          </div>
        </>
      )}
    </div>
  );
}

function Readout({
  label,
  value,
  tone = 'ok',
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-amber/40">{label}</span>
      <span
        className={`font-mono text-lg font-bold ${tone === 'warn' ? 'text-danger' : 'text-amber'} text-glow`}
      >
        {value}
      </span>
    </div>
  );
}
