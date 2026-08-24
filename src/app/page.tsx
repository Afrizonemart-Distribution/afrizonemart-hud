'use client';

import { useState } from 'react';
import { RequireAdmin } from '@/components/common/RequireAdmin';
import { HudTopBar } from '@/components/hud/HudTopBar';
import { SearchTracePanel } from '@/components/hud/SearchTracePanel';
import { OrderJourneyPanel } from '@/components/hud/OrderJourneyPanel';

const TABS = [
  { key: 'order-journey', label: 'Order Journey' },
  { key: 'search', label: 'Search Pipeline' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/**
 * Tab-selected panels rather than a full nav — this stays a tight,
 * purpose-built tool, not a general admin console. New algorithm
 * systems add a new tab here as they get a trace endpoint + panel
 * (see afrizonemart-api's src/modules/hud/).
 */
export default function HudHomePage() {
  const [tab, setTab] = useState<TabKey>('order-journey');

  return (
    <RequireAdmin>
      <div className="min-h-screen">
        <HudTopBar />
        <div className="border-b border-amber/15 px-6">
          <nav className="mx-auto flex max-w-3xl gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`border-b-2 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  tab === t.key
                    ? 'border-amber text-amber text-glow'
                    : 'border-transparent text-amber/30 hover:text-amber/60'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <main className="mx-auto max-w-3xl px-6 py-10">
          {tab === 'order-journey' ? <OrderJourneyPanel /> : <SearchTracePanel />}
        </main>
      </div>
    </RequireAdmin>
  );
}
