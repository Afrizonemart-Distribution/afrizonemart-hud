export function RankedBars({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((i) => i.value), 1);

  if (items.length === 0) {
    return <p className="font-mono text-[10px] text-amber/30">No data in this window.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={it.label} className="flex items-center gap-2">
          <span className="w-3 shrink-0 font-mono text-[9px] text-danger/50">{i + 1}</span>
          <span className="w-20 shrink-0 truncate font-mono text-[10px] text-amber/70">{it.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-danger/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-danger/40 to-danger"
              style={{ width: `${(it.value / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-[9px] text-danger">{it.value}</span>
        </li>
      ))}
    </ul>
  );
}
