'use client';

import { useEffect, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { Radio } from 'lucide-react';
import { AFRICA_ISO, padIso } from '@/lib/africa-map-data';
import { useAuthStore } from '@/stores/authStore';

const ISO2_TO_ENTRY = new Map(Object.values(AFRICA_ISO).map((e) => [e.iso2, e]));

/// Deliberately one dominant glow color, not a rainbow per event type
/// — matches the reference HUD imagery (a radar/flight-tracker is
/// essentially monochrome with white/amber accents). Red is reserved
/// for genuinely bad news so it still means something when it fires.
const BAD_NEWS = new Set(['order.cancelled', 'order.refunded']);
const AMBER = '#FBAC34';
const RED = '#FF4D4D';

interface LiveEventPayload {
  event: string;
  country: string;
  label: string;
  detail: string;
  ts: number;
}

interface Pulse extends LiveEventPayload {
  id: string;
  lon: number;
  lat: number;
}

const PROJECTION_CONFIG = { scale: 480, center: [22, 3] as [number, number] };
const MAP_SIZE = 900;
/// How long a pulse stays on screen before fading — this is purely a
/// UI lifetime, unrelated to how long the real thing (a delivery, a
/// search) actually took.
const PULSE_TTL_MS = 5000;

/**
 * The whole HUD, replacing the old click-to-trace panels: one
 * persistent map, live events landing on it continuously as they
 * really happen (no button to press) — order lifecycle, search,
 * Civic Library downloads, via the SSE stream at /api/hud/events.
 *
 * Only plots events whose country falls inside the 54-nation African
 * footprint this map (reused from afrizonemart-v2's AfricaMap) already
 * covers — an order shipping outside Africa is silently skipped for
 * now rather than stretching this to a full world map.
 *
 * Visual language deliberately leans into "radar / flight-tracker",
 * not "choropleth map": a continuously rotating sweep + concentric
 * range rings as ambient chrome (the system is always being watched,
 * whether or not anything's pulsing right now), a glow filter on the
 * coastlines instead of a flat fill, and bursts at each event's real
 * location instead of a static highlighted country.
 */
export function LiveMap() {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [connected, setConnected] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const es = new EventSource(`${apiBase}/api/hud/events?token=${encodeURIComponent(accessToken)}`);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      let data: LiveEventPayload;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      const entry = ISO2_TO_ENTRY.get(data.country);
      if (!entry) return;
      const id = `${data.ts}-${Math.random().toString(36).slice(2, 8)}`;
      const pulse: Pulse = { ...data, id, lon: entry.capital[0], lat: entry.capital[1] };
      setPulses((prev) => [...prev, pulse]);
      setEventCount((c) => c + 1);
      setTimeout(() => setPulses((prev) => prev.filter((p) => p.id !== id)), PULSE_TTL_MS);
    };

    return () => es.close();
  }, [accessToken]);

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
        {/* Ambient chrome — range rings + rotating sweep. Purely
            decorative, independent of real data, always running so
            the panel reads as "watching" even between events. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative aspect-square w-[92%]">
            <div className="range-ring" style={{ inset: '0%' }} />
            <div className="range-ring" style={{ inset: '17%' }} />
            <div className="range-ring" style={{ inset: '34%' }} />
            <div className="range-ring" style={{ inset: '51%' }} />
            <div className="radar-sweep" />
          </div>
        </div>

        <ComposableMap
          projection="geoMercator"
          projectionConfig={PROJECTION_CONFIG}
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
                        fill: 'rgba(251,172,52,0.06)',
                        stroke: AMBER,
                        strokeWidth: 0.8,
                        strokeOpacity: 0.7,
                        outline: 'none',
                        filter: 'url(#coastGlow)',
                      },
                      hover: {
                        fill: 'rgba(251,172,52,0.06)',
                        stroke: AMBER,
                        strokeWidth: 0.8,
                        strokeOpacity: 0.7,
                        outline: 'none',
                      },
                      pressed: {
                        fill: 'rgba(251,172,52,0.06)',
                        stroke: AMBER,
                        strokeWidth: 0.8,
                        outline: 'none',
                      },
                    }}
                  />
                ))
            }
          </Geographies>

          {pulses.map((p) => {
            const color = BAD_NEWS.has(p.event) ? RED : AMBER;
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
                <text x={9} y={0} className="font-mono" fontSize={7} fill="rgba(251,172,52,0.6)">
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
