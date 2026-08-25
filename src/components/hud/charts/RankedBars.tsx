export interface RankedBarItem {
  label: string;
  value: number;
  /// e.g. the query's most common country — shown as a small badge
  /// next to the label, omitted when there's nothing to show.
  sublabel?: string | null;
}

export function RankedBars({ items }: { items: RankedBarItem[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);

  if (items.length === 0) {
    return <p className="font-mono text-[10px] text-amber/30">No data in this window.</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={`${it.label}-${i}`} className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 font-mono text-[9px] text-danger/50">{i + 1}</span>
              {/* Full text, never cut off — wraps instead of truncating,
                  with a title attribute as a redundant hover affordance. */}
              <span className="break-words font-mono text-[10px] leading-snug text-amber/70" title={it.label}>
                {it.label}
              </span>
            </span>
            {it.sublabel && (
              <span className="shrink-0 rounded border border-danger/30 px-1 py-px font-mono text-[8px] uppercase tracking-wide text-danger/60">
                {it.sublabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-danger/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-danger/40 to-danger"
                style={{ width: `${(it.value / max) * 100}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right font-mono text-[9px] text-danger">{it.value}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
