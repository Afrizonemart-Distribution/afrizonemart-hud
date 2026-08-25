'use client';

import { SearchOpsDashboard } from '@/components/hud/SearchOpsDashboard';

/**
 * Search & Discovery — the Alibaba DataV ops-dashboard reference
 * applied to real search data: a dense grid of small red-accented
 * panels (query mix, top queries, volume trends, latency, zero-result
 * queries, country breakdown) framing a live globe of search activity
 * at the center. All data from GET /api/admin/search/{stats,timeseries}.
 *
 * RequireAdmin/HudTopBar/HudNav now live in the shared (hud)/layout.tsx.
 */
export default function SearchOpsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <SearchOpsDashboard />
    </main>
  );
}
