'use client';

import { useMemo } from 'react';
import MyHr, { type MyHrClient } from '@/components/my-hr/MyHr';
import { apiFetchAuthed, HttpApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/authStore';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * My HR for HUD staff: their own leave, pay, documents and claims. The
 * screens are the shared My HR module (components/my-hr, the same in every
 * staff admin); this page only hands it HUD's signed-in session. It sits on
 * a light panel because the module is designed for a light page.
 */
export default function MyHrPage() {
  const client = useMemo<MyHrClient>(
    () => ({
      call: (path, init) =>
        apiFetchAuthed(`/api/hr/me${path}`, {
          method: init?.method ?? 'GET',
          body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        }),
      file: async (path) => {
        const store = useAuthStore.getState();
        const token = store.accessToken ?? (await store.refresh());
        const res = await fetch(`${API_BASE}/api/hr/me${path}`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new HttpApiError(res.status, 'FILE', 'Could not open that document.');
        return res.blob();
      },
    }),
    [],
  );
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="rounded-2xl bg-[#f6f6fb] p-4 md:p-6">
        <MyHr client={client} />
      </div>
    </main>
  );
}
