'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface RouteNode {
  key: string;
  label: string;
  icon: LucideIcon;
  /// Short live readout shown in the floating label as the marker
  /// reaches this node, and the weight (ms) that decides how long the
  /// marker lingers here before moving on — real stage duration,
  /// scaled, so a slow stage visibly takes longer than a fast one.
  detail: string;
  weightMs: number;
}

const VIEW_W = 640;
const VIEW_H = 160;
/// Total on-screen travel time regardless of how long the real trace
/// took — real durations only decide the *relative* pacing between
/// stages (see weightMs), not the absolute length of the animation.
const TOTAL_TRAVEL_MS = 2200;
const MIN_STEP_MS = 260;

function nodePosition(i: number, total: number): { x: number; y: number } {
  const margin = 60;
  const x = total === 1 ? VIEW_W / 2 : margin + (i / (total - 1)) * (VIEW_W - margin * 2);
  // Alternate high/low like a flight path's criss-crossing routes —
  // every third node dips lower to break up a too-regular zig-zag.
  const band = i % 3 === 1 ? 0.75 : i % 3 === 2 ? 0.3 : 0.5;
  const y = 30 + band * (VIEW_H - 60);
  return { x, y };
}

/**
 * A flight-tracker style route: nodes connected by straight glowing
 * segments, a marker that actually travels from node to node (real
 * stage timing decides relative pacing), pulsing hubs, and a floating
 * label that follows the marker showing what's happening at each stop.
 */
export function RouteMap({ nodes, runToken }: { nodes: RouteNode[]; runToken: number }) {
  const [activeIndex, setActiveIndex] = useState(-1);

  const positions = useMemo(() => nodes.map((_, i) => nodePosition(i, nodes.length)), [nodes]);

  useEffect(() => {
    if (nodes.length === 0) return;
    setActiveIndex(-1);
    const totalWeight = nodes.reduce((sum, n) => sum + n.weightMs, 0) || 1;
    let cursor = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    nodes.forEach((node, i) => {
      const share = Math.max(MIN_STEP_MS, (node.weightMs / totalWeight) * TOTAL_TRAVEL_MS);
      cursor += share;
      timers.push(setTimeout(() => setActiveIndex(i), cursor));
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken, nodes.length]);

  const marker = activeIndex >= 0 ? positions[activeIndex] : positions[0];
  const activeNode = activeIndex >= 0 ? nodes[activeIndex] : null;

  const pathD = positions.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  // Cumulative segment lengths so the "revealed so far" stroke can
  // stop exactly at the active node instead of the whole path glowing
  // at once.
  const segLengths: number[] = [];
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x;
    const dy = positions[i].y - positions[i - 1].y;
    segLengths.push(Math.hypot(dx, dy));
  }
  const totalLength = segLengths.reduce((a, b) => a + b, 0) || 1;
  const revealedLength =
    activeIndex <= 0 ? 0 : segLengths.slice(0, activeIndex).reduce((a, b) => a + b, 0);

  return (
    <div className="hud-corners hud-panel relative overflow-hidden p-4">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" style={{ height: 'auto' }}>
        {/* Dim base path — the full route, always visible */}
        <path d={pathD} fill="none" stroke="#FBAC34" strokeOpacity={0.12} strokeWidth={1.5} />
        {/* Glowing revealed path — grows as the marker advances */}
        <path
          d={pathD}
          fill="none"
          stroke="#FBAC34"
          strokeWidth={2}
          strokeLinecap="round"
          style={{
            filter: 'drop-shadow(0 0 4px rgba(251,172,52,0.8))',
            strokeDasharray: totalLength,
            strokeDashoffset: totalLength - revealedLength,
            transition: 'stroke-dashoffset 260ms linear',
          }}
        />

        {positions.map((p, i) => {
          const reached = i <= activeIndex;
          const current = i === activeIndex;
          return (
            <g key={nodes[i].key}>
              {current && (
                <circle cx={p.x} cy={p.y} r={14} fill="#FBAC34" opacity={0.25}>
                  <animate attributeName="r" values="10;20;10" dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0;0.4" dur="1.4s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={7}
                fill={reached ? '#FBAC34' : '#050614'}
                stroke="#FBAC34"
                strokeOpacity={reached ? 1 : 0.3}
                strokeWidth={1.5}
                style={reached ? { filter: 'drop-shadow(0 0 5px rgba(251,172,52,0.9))' } : undefined}
              />
              <text
                x={p.x}
                y={p.y + 22}
                textAnchor="middle"
                className="font-mono"
                fontSize={9}
                fill={reached ? '#FBAC34' : 'rgba(251,172,52,0.3)'}
                style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                {nodes[i].label}
              </text>
            </g>
          );
        })}

        {/* Traveling marker */}
        {activeIndex >= 0 && (
          <circle
            cx={marker.x}
            cy={marker.y}
            r={4}
            fill="#FFD27A"
            style={{
              filter: 'drop-shadow(0 0 8px rgba(255,210,122,1))',
              transition: 'cx 260ms linear, cy 260ms linear',
            }}
          />
        )}
      </svg>

      {/* Floating info card, tracks the marker */}
      {activeNode && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-amber/50 bg-void/90 px-2.5 py-1.5 shadow-glow-sm transition-all duration-200"
          style={{
            left: `${(marker.x / VIEW_W) * 100}%`,
            top: `${(marker.y / VIEW_H) * 100 - 6}%`,
          }}
        >
          <p className="whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-widest text-amber text-glow">
            {activeNode.label}
          </p>
          <p className="max-w-[220px] truncate font-mono text-[10px] text-amber/60">{activeNode.detail}</p>
        </div>
      )}
    </div>
  );
}
