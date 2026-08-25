'use client';

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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <OrderJourneyMap />
    </main>
  );
}
