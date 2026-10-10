'use client';

import { HologramGlobe } from '@/components/hud/HologramGlobe';
import { Explain, ExplainProvider } from '@/components/hud/common/Explain';
import type { Explanation } from '@/lib/hud/advice';

/** Overview — the live globe of everything happening, with a hover explanation. */
const OVERVIEW: Record<string, Explanation<null>> = {
  globe: {
    title: 'Live activity globe',
    what: 'Every real order event (paid, shipped, out for delivery, delivered, cancelled, refunded), every search and every public-library download pulses on the globe at its country the moment it happens.',
    scale:
      'Quiet is normal at night. For detail: Store (live) shows shoppers, Order Journey shows stuck orders, Search shows what people look for, Backend Arcade shows server health — each has an Advisor that says what to do.',
  },
};

export default function HudHomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <ExplainProvider registry={OVERVIEW} ctx={null}>
        <p className="mb-3 font-mono text-[10px] text-amber/40">Hover the globe for what it shows. Every HUD page explains itself on hover.</p>
        <Explain k="globe">
          <HologramGlobe />
        </Explain>
      </ExplainProvider>
    </main>
  );
}
