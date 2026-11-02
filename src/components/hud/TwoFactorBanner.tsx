'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { apiFetchAuthed } from '@/lib/api/client';
import { useAuthStore } from '@/stores/authStore';

/** Same account everywhere, so staff turn 2FA on in the storefront's Security page. */
const SECURITY_URL = 'https://afrizonemart.com/account/security';

interface MfaStatus {
  enabled: boolean;
  /** Date 2FA becomes required (YYYY-MM-DD), or null. */
  requiredFrom?: string | null;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * 2FA is required for every /api/admin route from 14 Nov 2026
 * (afrizonemart-api#174), which is everything the HUD reads. Shown until
 * the account has 2FA on; /api/auth/mfa itself is never blocked.
 */
export function TwoFactorBanner() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<MfaStatus | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void apiFetchAuthed<MfaStatus>('/api/auth/mfa').then((s) => { if (active) setStatus(s); }, () => undefined);
    return () => { active = false; };
  }, [user]);

  if (!status || status.enabled) return null;
  const date = formatDate(status.requiredFrom);
  const enforced = Boolean(status.requiredFrom && new Date(`${status.requiredFrom}T00:00:00`).getTime() <= Date.now());

  return (
    <div role="status" className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-xs text-amber">
      <ShieldAlert size={16} className="shrink-0 text-danger" aria-hidden />
      <p className="min-w-0 flex-1">
        {enforced
          ? <><b className="text-danger">Two-factor is required.</b> The HUD can’t load admin data until you turn it on.</>
          : <><b className="text-danger">Turn on two-factor{date ? ` before ${date}` : ''}.</b> After that the HUD won’t load admin data without it.</>}
        {' '}Same account as the storefront: set it up there in 2 minutes, then sign in here again.
      </p>
      <a href={SECURITY_URL} target="_blank" rel="noopener noreferrer" className="rounded border border-amber px-3 py-1.5 font-bold uppercase tracking-widest text-amber hover:bg-amber/20">
        Set up 2FA
      </a>
    </div>
  );
}
