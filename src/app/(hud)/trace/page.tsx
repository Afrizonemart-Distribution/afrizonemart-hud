'use client';

import { TraceDashboard } from '@/components/hud/trace/TraceDashboard';

/**
 * Traceability — producers, the road to Verified, and the tamper-proof
 * ledger. RequireAdmin/HudTopBar/HudNav live in the shared (hud)/layout.tsx.
 */
export default function TracePage() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <TraceDashboard />
    </main>
  );
}
