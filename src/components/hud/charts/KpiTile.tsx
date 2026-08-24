export function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ops-corners ops-panel flex flex-col items-center justify-center gap-1 p-3 text-center">
      <span className="text-glow-red font-mono text-xl font-bold text-danger">{value}</span>
      <span className="font-mono text-[9px] uppercase tracking-widest text-danger/50">{label}</span>
      {sub && <span className="font-mono text-[8px] text-amber/40">{sub}</span>}
    </div>
  );
}
