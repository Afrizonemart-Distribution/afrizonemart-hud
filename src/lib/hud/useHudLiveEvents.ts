'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

export interface HudLiveEvent {
  event: string;
  country: string;
  label: string;
  detail: string;
  ts: number;
}

/**
 * One SSE connection per caller to /api/hud/events — every HUD page
 * (Overview, Order Journey, and whatever's added next) opens its own
 * stream rather than sharing a singleton, since each wants a
 * differently-filtered view of the same real event feed.
 *
 * `onEvent` is only read on mount/token-change, not re-subscribed on
 * every render — callers must only touch it via functional state
 * updaters (`setX(prev => ...)`) or module-level constants, never
 * values captured from a render that could go stale.
 */
export function useHudLiveEvents(onEvent: (event: HudLiveEvent) => void) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const es = new EventSource(`${apiBase}/api/hud/events?token=${encodeURIComponent(accessToken)}`);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data) as HudLiveEvent);
      } catch {
        /* malformed frame — drop it */
      }
    };

    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return { connected };
}
