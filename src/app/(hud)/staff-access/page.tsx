'use client';

import { StaffAccessPanel } from '@/components/staff-access/StaffAccessPanel';

/**
 * HUD's own Staff access: Owners and HUD Product Admins (everyone the shared
 * (hud)/layout.tsx RequireAdmin lets in) manage who can use the HUD. Only HUD
 * people show; the full every-product view is Part-Time → Staff access.
 */
export default function StaffAccessPage() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <StaffAccessPanel product="HUD" productLabel="the HUD" tone="dark" />
    </main>
  );
}
