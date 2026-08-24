'use client';

import { useRouter } from 'next/navigation';
import { LogOut, Radio } from 'lucide-react';
import { logoutUser } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/authStore';

export function HudTopBar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clear = useAuthStore((s) => s.clear);

  const handleLogout = async () => {
    if (accessToken) {
      try {
        await logoutUser(accessToken);
      } catch {
        /* ignore */
      }
    }
    clear();
    router.push('/login');
  };

  return (
    <header className="flex items-center justify-between gap-4 border-b border-amber/15 px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
        </span>
        <h1 className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-amber text-glow">
          Afrizonemart <span className="text-amber/40">{'//'}</span> Algorithm HUD
        </h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-amber/40 sm:flex">
          <Radio size={11} aria-hidden />
          {user?.email}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded border border-amber/25 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-amber/60 transition-colors hover:border-danger/50 hover:text-danger"
        >
          <LogOut size={12} aria-hidden />
          Sign out
        </button>
      </div>
    </header>
  );
}
