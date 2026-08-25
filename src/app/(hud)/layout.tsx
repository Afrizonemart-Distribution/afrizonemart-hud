'use client';

import { RequireAdmin } from '@/components/common/RequireAdmin';
import { HudTopBar } from '@/components/hud/HudTopBar';
import { HudNav } from '@/components/hud/HudNav';

/**
 * Shared shell for every gated HUD page (Overview, Order Journey,
 * Search). Previously each page.tsx wrapped itself in its own
 * <RequireAdmin><HudTopBar/><HudNav/> — since that tree wasn't shared
 * across routes, the App Router tore it down and rebuilt it fresh on
 * every nav-tab click (RequireAdmin's `hydrated` state resets to
 * false on every remount), which is the likely cause of clicking a
 * nav tab appearing to do nothing. Hoisting it into a layout means
 * only the route's own content actually swaps on navigation.
 */
export default function HudLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <div className="min-h-screen">
        <HudTopBar />
        <HudNav />
        {children}
      </div>
    </RequireAdmin>
  );
}
