'use client';

import { useId } from 'react';

const W = 300;

export function TrendChart({ data, height = 72 }: { data: number[]; height?: number }) {
  const gradientId = useId();

  if (data.length < 2) {
    return <div style={{ height }} className="flex items-center font-mono text-[10px] text-amber/30">Not enough data yet.</div>;
  }

  const max = Math.max(...data, 1);
  const stepX = W / (data.length - 1);
  const points = data.map((v, i): [number, number] => [i * stepX, height - (v / max) * height]);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height: 'auto' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF4D4D" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#FF4D4D" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="#FF4D4D"
        strokeWidth={1.5}
        style={{ filter: 'drop-shadow(0 0 3px rgba(255,77,77,0.6))' }}
      />
    </svg>
  );
}
