'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Graticule, Marker, Sphere } from 'react-simple-maps';
import type { ProjectionFunction } from 'react-simple-maps';
import { geoDistance, geoOrthographic } from 'd3-geo';
import { Radio } from 'lucide-react';
import { AFRICA_ISO, padIso } from '@/lib/africa-map-data';
import { useHudLiveEvents, type HudLiveEvent } from '@/lib/hud/useHudLiveEvents';

const ISO2_TO_ENTRY = new Map(Object.values(AFRICA_ISO).map((e) => [e.iso2, e]));

/// One dominant glow color, not a rainbow per event type — matches
/// the reference HUD imagery (a radar/flight-tracker is essentially
/// monochrome with one accent). Red is reserved for genuinely bad
/// news so it still means something when it fires.
const BAD_NEWS = new Set(['order.cancelled', 'order.refunded']);
const AMBER = '#FBAC34';
const RED = '#FF4D4D';

export interface HologramGlobeProps {
  /// When set, only matching events are plotted — used to embed a
  /// scoped globe (e.g. search-only) inside another page's dashboard
  /// instead of showing every algorithm's activity.
  eventFilter?: (event: HudLiveEvent) => boolean;
  /// Hides the Live/event-count status row — the embedding page
  /// already has its own connection indicator.
  compact?: boolean;
  /// Sphere/coastline/tick-ring/pulse color. Defaults to the site's
  /// amber; pass the page's own accent (e.g. red for the Search ops
  /// dashboard) to keep an embedded globe visually part of that page.
  accent?: string;
}

interface Pulse extends HudLiveEvent {
  id: string;
  lon: number;
  lat: number;
}

const MAP_SIZE = 900;
const GLOBE_SCALE = 330;
/// Africa's rough center — this is the resting orientation the globe
/// sways around, not a starting point it drifts away from. Longitude
/// sign is inverted per d3's rotate convention (rotate lambda = -center lon).
const REST_ROTATE: [number, number] = [-20, 3];
/// A slow figure-eight-ish sway rather than a full spin — "alive" and
/// animated like a hologram, but Africa (our only real data) never
/// rotates out of view the way a continuous 360° spin would cause.
const SWAY_LON_DEG = 9;
const SWAY_LAT_DEG = 3;
const SWAY_PERIOD_MS = 16000;
const PULSE_TTL_MS = 5000;

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function TickRing({ radius, rgb }: { radius: number; rgb: string }) {
  const center = MAP_SIZE / 2;
  const ticks = useMemo(() => {
    const items: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let deg = 0; deg < 360; deg += 5) {
      const major = deg % 30 === 0;
      const rad = (deg * Math.PI) / 180;
      const outer = radius + (major ? 16 : 9);
      // Rounded to a fixed precision so SSR and client markup always
      // agree — raw float trig output can differ in the last digit
      // between engines/builds and trips a hydration mismatch warning.
      const round = (n: number) => Math.round(n * 1000) / 1000;
      items.push({
        x1: round(center + Math.sin(rad) * radius),
        y1: round(center - Math.cos(rad) * radius),
        x2: round(center + Math.sin(rad) * outer),
        y2: round(center - Math.cos(rad) * outer),
        major,
      });
    }
    return items;
  }, [center, radius]);

  return (
    <svg
      viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <circle cx={center} cy={center} r={radius + 22} fill="none" stroke={`rgba(${rgb},0.15)`} strokeWidth={1} />
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={t.major ? `rgba(${rgb},0.55)` : `rgba(${rgb},0.22)`}
          strokeWidth={t.major ? 1.4 : 0.8}
        />
      ))}
    </svg>
  );
}

/**
 * The "Overall" view — every algorithm's real activity landing on one
 * live globe simultaneously, no button to press. Per the 2026-08-24
 * direction: not a flat outline map, a hologram — a shaded sphere
 * with a graticule wireframe, a slow ambient sway instead of a static
 * pose, and a compass-style tick ring framing it like the reference
 * ops-dashboard globe.
 *
 * react-simple-maps' `projection` prop does NOT call a factory
 * function you hand it — despite the `ProjectionFunction` type
 * suggesting `(width, height, config) => GeoProjection` — its
 * internal `makeProjection` does `if (typeof projection ===
 * "function") return projection` verbatim. It expects an
 * already-*built* d3 projection instance (which is itself callable,
 * hence `typeof === "function"`), not a builder. Passing a builder
 * crashed downstream in d3-geo's `geoPath().projection(...)` with a
 * minified "e is not a function" — so the projection instance is
 * built here via useMemo and passed in directly, never as a factory.
 */
export function HologramGlobe({ eventFilter, compact = false, accent = AMBER }: HologramGlobeProps = {}) {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [rotate, setRotate] = useState<[number, number]>(REST_ROTATE);
  const rafRef = useRef<number>();
  const rgb = useMemo(() => hexToRgb(accent), [accent]);
  const projection = useMemo(
    () =>
      geoOrthographic()
        .scale(GLOBE_SCALE)
        .translate([MAP_SIZE / 2, MAP_SIZE / 2])
        .rotate([rotate[0], rotate[1], 0])
        .clipAngle(90),
    [rotate],
  );

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / SWAY_PERIOD_MS;
      setRotate([
        REST_ROTATE[0] + Math.sin(t * Math.PI * 2) * SWAY_LON_DEG,
        REST_ROTATE[1] + Math.sin(t * Math.PI * 2 * 0.6) * SWAY_LAT_DEG,
      ]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const { connected } = useHudLiveEvents((data) => {
    if (eventFilter && !eventFilter(data)) return;
    const entry = ISO2_TO_ENTRY.get(data.country);
    if (!entry) return;
    const id = `${data.ts}-${Math.random().toString(36).slice(2, 8)}`;
    const pulse: Pulse = { ...data, id, lon: entry.capital[0], lat: entry.capital[1] };
    setPulses((prev) => [...prev, pulse]);
    setEventCount((c) => c + 1);
    setTimeout(() => setPulses((prev) => prev.filter((p) => p.id !== id)), PULSE_TTL_MS);
  });

  const viewCenter: [number, number] = [-rotate[0], -rotate[1]];

  return (
    <div className="flex flex-col gap-4">
      {!compact && (
        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest">
          <span className={`flex items-center gap-1.5 ${connected ? 'text-success' : 'text-danger'}`}>
            <Radio size={12} aria-hidden />
            {connected ? 'Live' : 'Connecting…'}
          </span>
          <span className="text-amber/40">events observed — {eventCount}</span>
        </div>
      )}

      <div className="hud-corners hud-panel radar-frame relative overflow-hidden p-2">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -z-0 aspect-square w-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
          style={{ background: `radial-gradient(circle, rgba(${rgb},0.16), rgba(${rgb},0) 70%)` }}
        />
        <TickRing radius={GLOBE_SCALE + 6} rgb={rgb} />

        <ComposableMap
          // @types/react-simple-maps mistypes this prop as a
          // (width, height, config) => GeoProjection factory; the
          // real runtime contract (see the doc comment above) wants
          // an already-built GeoProjection instance instead — cast
          // around the wrong upstream type rather than the wrong
          // runtime shape.
          projection={projection as unknown as ProjectionFunction}
          width={MAP_SIZE}
          height={MAP_SIZE}
          style={{ width: '100%', height: 'auto', position: 'relative' }}
        >
          <defs>
            <filter id="coastGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <Sphere id="hud-sphere" fill="rgba(10,15,61,0.55)" stroke={accent} strokeWidth={1.2} />
          <Graticule stroke={`rgba(${rgb},0.14)`} step={[15, 15]} />

          <Geographies geography="/maps/world-50m.json">
            {({ geographies }) =>
              geographies
                .filter((geo) => AFRICA_ISO[padIso(geo.id)])
                .map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{
                      default: {
                        fill: `rgba(${rgb},0.08)`,
                        stroke: accent,
                        strokeWidth: 0.8,
                        strokeOpacity: 0.75,
                        outline: 'none',
                        filter: 'url(#coastGlow)',
                      },
                      hover: {
                        fill: `rgba(${rgb},0.08)`,
                        stroke: accent,
                        strokeWidth: 0.8,
                        strokeOpacity: 0.75,
                        outline: 'none',
                      },
                      pressed: {
                        fill: `rgba(${rgb},0.08)`,
                        stroke: accent,
                        strokeWidth: 0.8,
                        outline: 'none',
                      },
                    }}
                  />
                ))
            }
          </Geographies>

          {pulses
            .filter((p) => geoDistance(viewCenter, [p.lon, p.lat]) < Math.PI / 2 - 0.05)
            .map((p) => {
              const color = BAD_NEWS.has(p.event) ? RED : accent;
              return (
                <Marker key={p.id} coordinates={[p.lon, p.lat]}>
                  <circle r={16} fill={color} opacity={0.2}>
                    <animate attributeName="r" values="8;28;8" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle r={5} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
                  <circle r={5} fill="none" stroke={color} strokeWidth={1} opacity={0.6}>
                    <animate attributeName="r" values="5;22" dur="1.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                  <text
                    x={9}
                    y={-10}
                    className="font-mono"
                    fontSize={8}
                    fontWeight={700}
                    fill={color}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
                  >
                    {p.label}
                  </text>
                  <text x={9} y={0} className="font-mono" fontSize={7} fill={`rgba(${rgb},0.6)`}>
                    {p.detail}
                  </text>
                </Marker>
              );
            })}
        </ComposableMap>
      </div>
    </div>
  );
}
