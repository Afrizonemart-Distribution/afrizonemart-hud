'use client';

import { useEffect, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { Radio } from 'lucide-react';
import { AFRICA_ISO, padIso } from '@/lib/africa-map-data';
import { useAuthStore } from '@/stores/authStore';

const ISO2_TO_ENTRY = new Map(Object.values(AFRICA_ISO).map((e) => [e.iso2, e]));

const EVENT_COLOR: Record<string, string> = {
  'order.paid': '#FBAC34',
  'order.shipped': '#4DD8FF',
  'order.out_for_delivery': '#4DD8FF',
  'order.delivered': '#3DDC97',
  'order.cancelled': '#FF4D4D',
  'order.refunded': '#FF4D4D',
  'search.performed': '#FFD27A',
  'document.downloaded': '#B794F4',
};

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
const PULSE_TTL_MS = 4500;

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

      <div className="hud-corners hud-panel relative overflow-hidden p-2">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={PROJECTION_CONFIG}
          width={MAP_SIZE}
          height={MAP_SIZE}
          style={{ width: '100%', height: 'auto' }}
        >
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
                        fill: 'rgba(251,172,52,0.04)',
                        stroke: 'rgba(251,172,52,0.25)',
                        strokeWidth: 0.6,
                        outline: 'none',
                      },
                      hover: { fill: 'rgba(251,172,52,0.04)', stroke: 'rgba(251,172,52,0.25)', outline: 'none' },
                      pressed: { fill: 'rgba(251,172,52,0.04)', stroke: 'rgba(251,172,52,0.25)', outline: 'none' },
                    }}
                  />
                ))
            }
          </Geographies>

          {pulses.map((p) => {
            const color = EVENT_COLOR[p.event] ?? '#FBAC34';
            return (
              <Marker key={p.id} coordinates={[p.lon, p.lat]}>
                <circle r={10} fill={color} opacity={0.25}>
                  <animate attributeName="r" values="6;16;6" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.35;0;0.35" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle r={3} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                <text
                  x={6}
                  y={-8}
                  className="font-mono"
                  fontSize={7}
                  fill={color}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
                >
                  {p.label}
                </text>
                <text x={6} y={0} className="font-mono" fontSize={6.5} fill="rgba(251,172,52,0.5)">
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
