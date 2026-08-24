const COLORS = ['#FF4D4D', '#FF8A5B', '#FFB4A2', '#FFD27A', '#C9184A', '#F25C54', '#E85D75'];

export function Donut({
  data,
  centerValue,
  centerLabel,
}: {
  data: Array<{ label: string; value: number }>;
  centerValue: string;
  centerLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 38;
  const C = 2 * Math.PI * R;
  let acc = 0;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,77,77,0.08)" strokeWidth="12" />
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = `${frac * C} ${C - frac * C}`;
            const offset = -acc * C;
            acc += frac;
            return (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth="12"
                strokeDasharray={dash}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-glow-red font-mono text-lg font-bold text-danger">{centerValue}</span>
          <span className="font-mono text-[7px] uppercase tracking-widest text-danger/50">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-1 overflow-hidden">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-2 font-mono text-[10px]">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-amber/60">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="shrink-0 text-danger">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
