'use client';

import { RequireAdmin } from '@/components/common/RequireAdmin';
import { HudTopBar } from '@/components/hud/HudTopBar';
import { SearchTracePanel } from '@/components/hud/SearchTracePanel';

/**
 * Single-page HUD for now — one panel (Search). As new algorithm
 * systems get a trace endpoint (see afrizonemart-api's
 * src/modules/hud/), they get a new panel here, tab-selected rather
 * than a full nav; this stays a tight, purpose-built tool, not a
 * general admin console.
 */
export default function HudHomePage() {
  return (
    <RequireAdmin>
      <div className="min-h-screen">
        <HudTopBar />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <div className="mb-6 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber shadow-glow-sm" />
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-amber/70">
              Search &amp; Discovery — Query Pipeline
            </h2>
          </div>
          <SearchTracePanel />
        </main>
      </div>
    </RequireAdmin>
  );
}
