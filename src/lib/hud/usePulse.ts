'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { PulseParticle, PulseSnapshot } from './pulseTypes';
import type { PulseSim } from './pulseSim';

export type PulseSource =
  | { mode: 'live' }
  | { mode: 'staging'; url: string; key: string }
  | { mode: 'sim' };

const HISTORY = 120; // 60 s of 500 ms frames

/**
 * One frame every 500 ms from /api/hud/pulse (LIVE = this HUD's API,
 * STAGING = the loadtest copy via its HUD_PULSE_KEY) or from the local
 * simulator (SIM).
 *
 * React state updates at that 2 Hz frame rate only. Particles go into
 * `incoming` (a ref) for the canvas's own requestAnimationFrame loop to
 * drain — never setState per animation frame (see the HUD nav-hang fix).
 */
export function usePulse(source: PulseSource, sim: PulseSim) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [snap, setSnap] = useState<PulseSnapshot | null>(null);
  const [history, setHistory] = useState<PulseSnapshot[]>([]);
  const [connected, setConnected] = useState(false);
  const incoming = useRef<PulseParticle[]>([]);

  const sourceKey = source.mode === 'staging' ? `staging|${source.url}|${source.key}` : source.mode;

  useEffect(() => {
    setHistory([]);
    setSnap(null);
    incoming.current = [];

    const onFrame = (s: PulseSnapshot) => {
      setSnap(s);
      setHistory((h) => (h.length >= HISTORY ? [...h.slice(1), s] : [...h, s]));
      // Cap the backlog so a hidden tab doesn't build a flood to replay.
      incoming.current = incoming.current.concat(s.particles).slice(-400);
    };

    if (source.mode === 'sim') {
      sim.reset();
      setConnected(true);
      const id = setInterval(() => onFrame(sim.step(500)), 500);
      return () => clearInterval(id);
    }

    let url: string;
    if (source.mode === 'live') {
      if (!accessToken) return;
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      url = `${apiBase}/api/hud/pulse?token=${encodeURIComponent(accessToken)}`;
    } else {
      if (!source.url || !source.key) return;
      url = `${source.url.replace(/\/+$/, '')}/api/hud/pulse?key=${encodeURIComponent(source.key)}`;
    }

    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        onFrame(JSON.parse(msg.data) as PulseSnapshot);
      } catch {
        /* malformed frame — drop it */
      }
    };
    return () => {
      es.close();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, accessToken]);

  return { snap, history, connected, incoming };
}
