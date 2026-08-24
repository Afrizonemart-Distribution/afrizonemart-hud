export function Histogram({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  if (data.length === 0) {
    return <p className="font-mono text-[10px] text-amber/30">No data in this window.</p>;
  }

  return (
    <div className="flex h-24 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-mono text-[8px] text-danger/70">{d.value}</span>
          <div
            className="w-full rounded-t bg-gradient-to-t from-danger/70 to-danger"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: 2 }}
          />
          <span className="w-full truncate text-center font-mono text-[8px] uppercase text-amber/40">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
