'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  children: React.ReactNode;
}

/**
 * Gate for the whole app — ADMIN role only, deliberately stricter
 * than afrizonemart-v2-supplier's RequireAdmin (which also admits
 * STAFF). The HUD was scoped as admin-only, not a STAFF-grantable
 * capability, so this checks the role directly rather than going
 * through effectiveCapabilities.
 */
export function RequireAdmin({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const user = useAuthStore((s) => s.user);
  const refreshing = useAuthStore((s) => s.refreshing);
  const isAuthed = Boolean(user);
  const isAdmin = user?.role === 'ADMIN';

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
          This console is restricted to ADMIN accounts.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
