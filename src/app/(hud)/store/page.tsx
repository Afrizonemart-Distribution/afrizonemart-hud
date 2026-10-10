'use client';

import { StoreGame, StoreGameBoundary } from '@/components/hud/store/StoreGame';

/**
 * Store — Afrizonemart as a live Sims-style 3D store: every shopper is a
 * character acting out their real visit; replays for the last 90 days.
 * Real data is limited server-side to STORE_GAME_VIEWER_IDS.
 */
export default function StorePage() {
  return (
    <main className="mx-auto max-w-[1600px] px-6 py-6">
      <StoreGameBoundary>
        <StoreGame />
      </StoreGameBoundary>
    </main>
  );
}
