'use client';

import { BackendArcade } from '@/components/hud/arcade/BackendArcade';

/**
 * Backend Arcade — the API as a live game level (shoppers → cache →
 * Node → Postgres), fed by GET /api/hud/pulse. Built to watch the k6
 * load test the way the "$12 server" video shows it.
 */
export default function ArcadePage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <BackendArcade />
    </main>
  );
}
