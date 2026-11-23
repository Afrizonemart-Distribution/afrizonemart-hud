'use client';

import { useEffect, useRef } from 'react';
import { apiFetchAuthed, HttpApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/authStore';

/**
 * Workforce online signal for the HUD (AZM HR Console, 2026-11-23).
 *
 * Same beacon the supplier portal has sent since the workforce module
 * shipped (portal StaffPresence.tsx): POST /api/staff/session/heartbeat every
 * 60 s while the tab is visible, idle after 5 minutes without input, session
 * ended when the tab is hidden. The API stamps the session with this admin's
 * product (the token's `app`), so HR's "who's working" board shows where.
 *
 * Renders nothing; no-ops for non-staff; every failure is swallowed, a missed
 * beat is a gap in attendance data, never a broken page.
 */

const HEARTBEAT_INTERVAL_MS = 60_000;
const IDLE_THRESHOLD_MS = 5 * 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const;
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function StaffPresence(): null {
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = role === 'STAFF' || role === 'ADMIN';
  const sessionIdRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isStaff || typeof window === 'undefined') return;
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const beat = async () => {
      const idle = Date.now() - lastActivityRef.current >= IDLE_THRESHOLD_MS;
      try {
        const result = await apiFetchAuthed<{ sessionId: string }>('/api/staff/session/heartbeat', {
          method: 'POST',
          body: JSON.stringify({ sessionId: sessionIdRef.current ?? undefined, idle, path: window.location.pathname }),
        });
        sessionIdRef.current = result.sessionId;
      } catch (err) {
        // A session the idle sweep already closed 404s: open a fresh one next beat.
        if (err instanceof HttpApiError && err.status === 404) sessionIdRef.current = null;
      }
    };

    const start = () => {
      if (intervalId) return;
      void beat();
      intervalId = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    };
    const end = () => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      sessionIdRef.current = null;
      const token = useAuthStore.getState().accessToken;
      // keepalive fetch survives the tab going away and, unlike sendBeacon, carries the bearer token.
      void fetch(`${API_BASE}/api/staff/session/end`, {
        method: 'POST',
        keepalive: true,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sessionId: sid, reason: 'SIGNED_OUT' }),
      }).catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        end();
      } else start();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
      end();
    };
  }, [isStaff]);

  return null;
}
