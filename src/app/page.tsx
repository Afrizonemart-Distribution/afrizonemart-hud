'use client';

import { RequireAdmin } from '@/components/common/RequireAdmin';
import { HudTopBar } from '@/components/hud/HudTopBar';
import { LiveMap } from '@/components/hud/LiveMap';

/**
 * One persistent, always-on view — no click-to-trace, no tabs. Real
 * platform activity (order lifecycle, search, Civic Library
 * downloads) lands on the map continuously via /api/hud/events (SSE)
 * as it actually happens. Replaced the earlier click-a-button /
 * watch-one-trace panels (SearchTracePanel, OrderJourneyPanel,
 * RouteMap) entirely per the 2026-08-24 direction — see git history
 * if any of that pattern is worth reviving for a future "inspect one
 * specific thing" mode alongside this.
 */
export default function HudHomePage() {
  return (
    <RequireAdmin>
      <div className="min-h-screen">
        <HudTopBar />
        <main className="mx-auto max-w-5xl px-6 py-10">
          <LiveMap />
        </main>
      </div>
    </RequireAdmin>
  );
}
