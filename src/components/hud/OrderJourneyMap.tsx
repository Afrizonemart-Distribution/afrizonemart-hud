'use client';

import { useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { Radio } from 'lucide-react';
import { AFRICA_ISO, padIso } from '@/lib/africa-map-data';
import { useHudLiveEvents, type HudLiveEvent } from '@/lib/hud/useHudLiveEvents';

const ISO2_TO_ENTRY = new Map(Object.values(AFRICA_ISO).map((e) => [e.iso2, e]));

const NIGERIA = AFRICA_ISO['566'];
const HUB = { label: 'ORIGIN HUB — NIGERIA', lon: NIGERIA.capital[0], lat: NIGERIA.capital[1] };

/// Dual warm/cool palette straight out of the reference: red for the
/// "hot" live activity (hubs, flights, bad-news pings), cyan for the
/// base map itself — the two-tone split is the whole visual grammar.
const RED = '#FF4D4D';
const CYAN = '#4DD8FF';
const HOT = '#FFE3B0';
const SUCCESS = '#3DDC97';

const PING_COLOR: Record<string, string> = {
  'order.paid': HOT,
  'order.out_for_delivery': CYAN,
  'order.delivered': SUCCESS,
  'order.cancelled': RED,
  'order.refunded': RED,
};

interface Flight {
  id: string;
  destLon: number;
  destLat: number;
  detail: string;
  live: boolean;
}

interface Ping extends HudLiveEvent {
  id: string;
  lon: number;
  lat: number;
}

const PROJECTION_CONFIG = { scale: 480, center: [22, 3] as [number, number] };
const MAP_SIZE = 900;
const FLIGHT_MS = 2800;
const FLIGHT_LIFETIME_MS = FLIGHT_MS + 1200;
const PING_TTL_MS = 4200;

/**
 * Order Journey — applies the flight-tracker reference image close to
 * as-is: a glowing origin hub, straight red route lines, a marker
 * that actually travels the route with a floating price-tag card
 * following it, and cyan for the base map so the "live" red layer
 * reads as a separate, hotter data layer on top.
 *
 * `order.shipped` spawns a flight (the parcel is now physically
 * moving); `order.paid` / `order.out_for_delivery` / `order.delivered`
 * / `order.cancelled` / `order.refunded` land as status pings at the
 * destination — matching what each event actually means rather than
 * animating a "flight" for a purely financial event.
 */
export function OrderJourneyMap() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [pings, setPings] = useState<Ping[]>([]);
  const [eventCount, setEventCount] = useState(0);

  const { connected } = useHudLiveEvents((data) => {
    const entry = ISO2_TO_ENTRY.get(data.country);
    if (!entry) return;
    setEventCount((c) => c + 1);
    const id = `${data.ts}-${Math.random().toString(36).slice(2, 8)}`;

    if (data.event === 'order.shipped') {
      setFlights((prev) => [
        ...prev,
        { id, destLon: entry.capital[0], destLat: entry.capital[1], detail: data.detail, live: false },
      ]);
      // Flip on the next tick so the initial render paints the marker
      // at the hub, then this state change is what triggers the CSS
      // transition to travel out to the destination.
      setTimeout(() => {
        setFlights((prev) => prev.map((f) => (f.id === id ? { ...f, live: true } : f)));
      }, 30);
      setTimeout(() => setFlights((prev) => prev.filter((f) => f.id !== id)), FLIGHT_LIFETIME_MS);
      return;
    }

    if (!PING_COLOR[data.event]) return;
    const ping: Ping = { ...data, id, lon: entry.capital[0], lat: entry.capital[1] };
    setPings((prev) => [...prev, ping]);
    setTimeout(() => setPings((prev) => prev.filter((p) => p.id !== id)), PING_TTL_MS);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest">
        <span className={`flex items-center gap-1.5 ${connected ? 'text-success' : 'text-danger'}`}>
          <Radio size={12} aria-hidden />
          {connected ? 'Live' : 'Connecting…'}
        </span>
        <span className="text-amber/40">events observed — {eventCount}</span>
      </div>

      <div className="hud-corners hud-panel radar-frame relative overflow-hidden p-2">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={PROJECTION_CONFIG}
          width={MAP_SIZE}
          height={MAP_SIZE}
          style={{ width: '100%', height: 'auto', position: 'relative' }}
        >
          <defs>
            <filter id="oj-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

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
                        fill: 'rgba(77,216,255,0.04)',
                        stroke: CYAN,
                        strokeWidth: 0.6,
                        strokeOpacity: 0.35,
                        outline: 'none',
                      },
                      hover: { fill: 'rgba(77,216,255,0.04)', stroke: CYAN, strokeOpacity: 0.35, outline: 'none' },
                      pressed: { fill: 'rgba(77,216,255,0.04)', stroke: CYAN, outline: 'none' },
                    }}
                  />
                ))
            }
          </Geographies>

          {/* Origin hub — the reference's big glowing bloom, plus
              static dashed range rings (no animation needed, the
              flights and pings supply the motion). */}
          <Marker coordinates={[HUB.lon, HUB.lat]}>
            <circle r={26} fill={RED} opacity={0.14} style={{ filter: 'url(#oj-glow)' }} />
            <circle r={16} fill={RED} opacity={0.18}>
              <animate attributeName="r" values="14;20;14" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.24;0.08;0.24" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle r={22} fill="none" stroke={RED} strokeOpacity={0.35} strokeDasharray="2 3" />
            <circle r={32} fill="none" stroke={RED} strokeOpacity={0.2} strokeDasharray="2 4" />
            <circle r={4} fill="#fff" style={{ filter: `drop-shadow(0 0 6px ${RED})` }} />
            <text
              x={0}
              y={-38}
              textAnchor="middle"
              className="font-mono"
              fontSize={8}
              fontWeight={700}
              fill={RED}
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {HUB.label}
            </text>
          </Marker>

          {pings.map((p) => {
            const color = PING_COLOR[p.event] ?? HOT;
            return (
              <Marker key={p.id} coordinates={[p.lon, p.lat]}>
                <circle r={14} fill={color} opacity={0.22}>
                  <animate attributeName="r" values="7;24;7" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.35;0;0.35" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle r={4} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
                <text
                  x={8}
                  y={-8}
                  className="font-mono"
                  fontSize={7.5}
                  fontWeight={700}
                  fill={color}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
                >
                  {p.label}
                </text>
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Flight routes + traveling marker — a plain SVG overlay
            using our own projectMercator math (matching the
            ComposableMap's fixed scale/center exactly) rather than
            react-simple-maps' Marker, since Marker positions its
            children in a locally-transformed <g> that isn't a
            natural fit for a two-point line whose *far* end needs to
            independently animate. */}
        <svg
          viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          {flights.map((f) => {
            const [hx, hy] = projectMercator(HUB.lon, HUB.lat);
            const [dx, dy] = projectMercator(f.destLon, f.destLat);
            const [tx, ty] = f.live ? [dx, dy] : [hx, hy];
            return (
              <g key={f.id}>
                <line
                  x1={hx}
                  y1={hy}
                  x2={tx}
                  y2={ty}
                  stroke={RED}
                  strokeWidth={1.4}
                  strokeOpacity={0.6}
                  style={{
                    filter: 'drop-shadow(0 0 3px rgba(255,77,77,0.6))',
                    transition: f.live ? `x2 ${FLIGHT_MS}ms linear, y2 ${FLIGHT_MS}ms linear` : 'none',
                  }}
                />
                <circle
                  cx={tx}
                  cy={ty}
                  r={10}
                  fill={HOT}
                  opacity={0.2}
                  style={{ transition: f.live ? `cx ${FLIGHT_MS}ms linear, cy ${FLIGHT_MS}ms linear` : 'none' }}
                />
                <circle
                  cx={tx}
                  cy={ty}
                  r={5}
                  fill={HOT}
                  style={{
                    filter: `drop-shadow(0 0 8px ${HOT})`,
                    transition: f.live ? `cx ${FLIGHT_MS}ms linear, cy ${FLIGHT_MS}ms linear` : 'none',
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Floating price-tag cards, one per active flight — tracks
            the traveling marker via the same percentage math react-
            simple-maps uses internally for a geoMercator projection
            at this fixed scale/center. */}
        {flights.map((f) => {
          const [px, py] = projectMercator(f.live ? f.destLon : HUB.lon, f.live ? f.destLat : HUB.lat);
          return (
            <div
              key={f.id}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-danger/50 bg-void/90 px-2.5 py-1.5 shadow-glow-sm"
              style={{
                left: `${(px / MAP_SIZE) * 100}%`,
                top: `${(py / MAP_SIZE) * 100 - 4}%`,
                transition: f.live ? `left ${FLIGHT_MS}ms linear, top ${FLIGHT_MS}ms linear` : 'none',
              }}
            >
              <p className="whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-widest text-danger">
                In Transit
              </p>
              <p className="max-w-[220px] truncate font-mono text-[10px] text-amber/70">{f.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/// Mirrors d3's geoMercator math for the fixed PROJECTION_CONFIG above
/// so the floating price-tag overlay (a plain HTML div, outside the
/// SVG) can track the same point react-simple-maps is drawing inside
/// it — react-simple-maps doesn't expose its internal projection
/// instance to consumers, so this is a deliberate small duplication
/// rather than a shared import.
function projectMercator(lon: number, lat: number): [number, number] {
  const scale = PROJECTION_CONFIG.scale;
  const [centerLon, centerLat] = PROJECTION_CONFIG.center;
  const mercY = (v: number) => Math.log(Math.tan(Math.PI / 4 + (v * Math.PI) / 360));
  const x = MAP_SIZE / 2 + scale * (((lon - centerLon) * Math.PI) / 180);
  const y = MAP_SIZE / 2 - scale * (mercY(lat) - mercY(centerLat));
  return [x, y];
}
