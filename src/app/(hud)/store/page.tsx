'use client';

import { WorldBoundary, WorldGame } from '@/components/hud/world/WorldGame';

/**
 * Afrizonemart World — full-screen game: the city map and a walk-in mall
 * where every live shopper is a character; 90-day replays. Real data is
 * limited server-side to STORE_GAME_VIEWER_IDS.
 */
export default function StorePage() {
  return (
    <WorldBoundary>
      <WorldGame />
    </WorldBoundary>
  );
}
