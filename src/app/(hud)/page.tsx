'use client';

import { HologramGlobe } from '@/components/hud/HologramGlobe';

/**
 * Overview — the "Overall" view per the 2026-08-24 direction: every
 * algorithm's real activity landing on one live globe simultaneously,
 * no button to press, no per-request trace. Order lifecycle, search,
 * Civic Library downloads — all of it lands here as it actually
 * happens, via /api/hud/events (SSE). Per-algorithm pages with their
 * own dedicated visual language live alongside this one (see HudNav).
 *
 * RequireAdmin/HudTopBar/HudNav now live in the shared (hud)/layout.tsx.
 */
export default function HudHomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <HologramGlobe />
    </main>
  );
}
