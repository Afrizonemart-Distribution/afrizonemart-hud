'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  children: React.ReactNode;
}

/**
 * Gate for the whole app — HUD admins only: Owners (role ADMIN), and HUD
 * Product Admins (STAFF whose /me says productAdmin on this site, granted in
 * Part-Time → Staff access). Other staff stay out, deliberately stricter than
 * the supplier portal's RequireAdmin. The API enforces the same rule.
 */
export function RequireAdmin({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const user = useAuthStore((s) => s.user);
  const refreshing = useAuthStore((s) => s.refreshing);
  const isAuthed = Boolean(user);
  const isAdmin = user?.role === 'ADMIN' || (user?.role === 'STAFF' && user.productAdmin === true);

  useEffect(() => {
    if (useAuthStore.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated || refreshing) return;
    if (!isAuthed) {
      router.replace(`/login?returnUrl=${encodeURIComponent(pathname)}`);
    }
    // Authed but not ADMIN: no /dashboard to bounce to here (there's
    // no other role's app this repo serves) — render the denial state
    // in place below rather than redirecting anywhere.
  }, [hydrated, refreshing, isAuthed, pathname, router]);

  if (!hydrated || refreshing || !isAuthed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void font-mono text-xs uppercase tracking-widest text-amber/60">
        <span className="animate-blink">Authenticating…</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-void px-4 text-center font-mono">
        <span className="text-xs uppercase tracking-widest text-danger">Access denied</span>
        <p className="max-w-sm text-sm text-amber/50">
          This console is for HUD admins. Ask an Owner to add you in Part-Time → Staff access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
