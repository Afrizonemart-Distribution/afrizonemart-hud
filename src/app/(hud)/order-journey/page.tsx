'use client';

import { OrderTracker } from '@/components/hud/orders/OrderTracker';
import { OrderJourneyMap } from '@/components/hud/OrderJourneyMap';

/**
 * Order Journey — the flight-tracker reference image applied close to
 * as-is: a glowing origin hub, red route lines a marker actually
 * travels, and a floating price-tag card that follows it. Ambient and
 * live, same as Overview — every real order.shipped event spawns its
 * own flight, multiple can run at once, nothing to click.
 *
 * RequireAdmin/HudTopBar/HudNav now live in the shared (hud)/layout.tsx.
 */
export default function OrderJourneyPage() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <OrderTracker />
      <div>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber/60">Live shipments map</div>
        <OrderJourneyMap />
      </div>
    </main>
  );
}
