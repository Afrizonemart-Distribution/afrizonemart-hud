'use client';

/**
 * Staff access for ONE product, inside that product's own admin.
 *
 * The same file lives in the supplier portal, the storefront admin, Ink and
 * the HUD (src/components/staff-access/StaffAccessPanel.tsx); keep the copies
 * in step. It reads /api/admin/staff-access with ?product=<this product>, so
 * only this product's people show here — staff added in another product never
 * appear. The full, every-product view is Part-Time → Staff access.
 *
 * Who can use it: Owners and this product's Product Admins (the API decides;
 * this page only mirrors it). Everything needs a 2FA sign-in and is audited.
 * PLANNING/STAFF_ACCESS_HARDENING.md.
 */
import { useEffect, useMemo, useState } from 'react';
import { apiFetchAuthed, HttpApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/authStore';

export type StaffProduct = 'STOREFRONT' | 'SUPPLIER_OPS' | 'INK' | 'HUD' | 'PARTTIME';

interface Capability {
  key: string;
  domain: string;
  label: string;
}
interface Catalogue {
  product: StaffProduct;
  label: string;
  capabilities: Capability[];
}
interface Membership {
  product: StaffProduct;
  role: 'MEMBER' | 'PRODUCT_ADMIN';
  permissions: string[];
  isFinance: boolean;
  startsAt: string;
  endsAt: string | null;
}
interface Person {
  id: string;
  email: string;
  name: string | null;
  role: string;
  jobTitle: string | null;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  staffMemberships: Membership[];
}
interface AccessInput {
  role: 'MEMBER' | 'PRODUCT_ADMIN';
  permissions: string[];
  isFinance: boolean;
  startsAt?: string;
  endsAt: string | null;
}

const BASE = '/api/admin/staff-access';
const DAY = 86_400_000;

function explain(e: unknown, fallback: string): string {
  if (!(e instanceof HttpApiError)) return e instanceof Error ? e.message : fallback;
  switch (e.code) {
    case 'MFA_ENROLLMENT_REQUIRED':
      return 'Turn on two-factor authentication on your account first.';
    case 'MFA_SIGNIN_REQUIRED':
      return 'Sign out and sign in again with your two-factor code.';
    case 'NOT_A_STAFF_MANAGER':
    case 'NOT_YOUR_PRODUCT':
      return 'Only admins of this product can manage its staff.';
    case 'NOT_YOURSELF':
      return 'Ask another admin of this product, or an Owner, to change your own access.';
    default:
      return e.message || fallback;
  }
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const dateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const startIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const endIso = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);

function contract(m: Pick<Membership, 'startsAt' | 'endsAt'>, now = Date.now()) {
  if (new Date(m.startsAt).getTime() > now) return { tone: 'wait', label: `Starts ${fmt(m.startsAt)}` };
  if (!m.endsAt) return null;
  const left = new Date(m.endsAt).getTime() - now;
  if (left <= 0) return { tone: 'bad', label: 'Contract ended' };
  if (left <= 14 * DAY) return { tone: 'warn', label: `Ends in ${Math.ceil(left / DAY)}d` };
  return null;
}

/** Light for the supplier portal, storefront and Ink; dark for the HUD. */
function skin(tone: 'light' | 'dark') {
  const dark = tone === 'dark';
  return {
    card: dark ? 'rounded-lg border border-amber/20 bg-navy-dark/60 p-4' : 'rounded-lg border border-navy/10 bg-white p-4',
    text: dark ? 'text-amber-light' : 'text-navy',
    sub: dark ? 'text-amber-light/60' : 'text-navy/60',
    line: dark ? 'border-amber/15' : 'border-navy/10',
    input: dark
      ? 'w-full rounded-md border border-amber/30 bg-transparent px-3 py-2 text-sm text-amber-light placeholder:text-amber-light/40'
      : 'w-full rounded-md border border-navy/20 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy/40',
    primary: 'rounded-md bg-amber px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50',
    ghost: dark
      ? 'rounded-md border border-amber/30 px-4 py-2 text-sm text-amber-light disabled:opacity-50'
      : 'rounded-md border border-navy/20 px-4 py-2 text-sm text-navy disabled:opacity-50',
    danger: 'rounded-md border border-red-500/50 px-4 py-2 text-sm text-red-600 disabled:opacity-50',
    modal: dark ? 'bg-void text-amber-light border border-amber/30' : 'bg-white text-navy',
  };
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'wait' | 'info'; children: React.ReactNode }) {
  const c = {
    ok: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-yellow-100 text-yellow-900',
    bad: 'bg-red-100 text-red-800',
    wait: 'bg-slate-100 text-slate-700',
    info: 'bg-indigo-100 text-indigo-800',
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

export function StaffAccessPanel({
  product,
  productLabel,
  tone = 'light',
}: {
  product: StaffProduct;
  productLabel: string;
  tone?: 'light' | 'dark';
}) {
  const s = skin(tone);
  const myId = useAuthStore((st) => st.user?.id ?? null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [caps, setCaps] = useState<Capability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    setError(null);
    try {
      const q = `?product=${product}`;
      const [p, c] = await Promise.all([
        apiFetchAuthed<{ items: Person[] }>(`${BASE}/people${q}`),
        apiFetchAuthed<{ products: Catalogue[] }>(`${BASE}/products${q}`),
      ]);
      setPeople(p.items);
      setCaps(c.products.find((x) => x.product === product)?.capabilities ?? []);
    } catch (e) {
      setError(explain(e, 'Could not load staff.'));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? [])
      .map((p) => ({ person: p, m: p.staffMemberships.find((x) => x.product === product)! }))
      .filter((r) => r.m && (!q || `${r.person.name ?? ''} ${r.person.email}`.toLowerCase().includes(q)));
  }, [people, query, product]);

  const ending = rows.filter((r) => {
    const c = contract(r.m);
    return c && (c.tone === 'warn' || c.tone === 'bad');
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${s.text}`}>Staff access</h1>
          <p className={`text-sm ${s.sub}`}>
            Who works in {productLabel}, and what they can do. Staff you add here only get access to {productLabel}.
          </p>
        </div>
        <button className={s.primary} onClick={() => setAdding(true)} disabled={!people}>
          Add staff
        </button>
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {ending.length > 0 && (
        <div className="rounded-md border border-amber bg-amber/10 p-3 text-sm">
          <strong className={s.text}>Contracts ending: </strong>
          <span className={s.sub}>
            {ending
              .map((r) => `${r.person.name ?? r.person.email} (${contract(r.m)!.label.toLowerCase()})`)
              .join(', ')}
            . Extend or remove their access.
          </span>
        </div>
      )}

      <div className={s.card}>
        <input
          className={`${s.input} mb-3 max-w-sm`}
          placeholder="Search name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!people && !error && <p className={`text-sm ${s.sub}`}>Loading…</p>}
        {people && rows.length === 0 && (
          <p className={`text-sm ${s.sub}`}>No staff in {productLabel} yet. Use “Add staff”.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`border-b ${s.line} ${s.sub}`}>
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 pr-3 font-semibold">Access</th>
                  <th className="py-2 pr-3 font-semibold">Contract</th>
                  <th className="py-2 pr-3 font-semibold">Last sign-in</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ person, m }) => {
                  const c = contract(m);
                  return (
                    <tr key={person.id} className={`border-b ${s.line} align-top`}>
                      <td className="py-2 pr-3">
                        <div className={`font-semibold ${s.text}`}>{person.name ?? person.email}</div>
                        <div className={`text-xs ${s.sub}`}>
                          {person.email}
                          {person.jobTitle ? ` · ${person.jobTitle}` : ''}
                        </div>
                      </td>
                      <td className="space-x-1 py-2 pr-3">
                        {m.role === 'PRODUCT_ADMIN' ? (
                          <Pill tone="info">Product Admin</Pill>
                        ) : (
                          <Pill tone="wait">{m.permissions.length} permissions</Pill>
                        )}
                        {m.isFinance && <Pill tone="ok">Finance</Pill>}
                        {!person.mfaEnabled && <Pill tone="warn">No 2FA</Pill>}
                      </td>
                      <td className={`py-2 pr-3 ${s.sub}`}>
                        {c ? <Pill tone={c.tone as 'warn'}>{c.label}</Pill> : m.endsAt ? `Until ${fmt(m.endsAt)}` : 'Open-ended'}
                      </td>
                      <td className={`py-2 pr-3 ${s.sub}`}>{fmt(person.lastLoginAt)}</td>
                      <td className="py-2 text-right">
                        {person.id === myId ? (
                          <span className={`text-xs ${s.sub}`}>You</span>
                        ) : (
                          <button className={s.ghost} onClick={() => setEditing(person)}>
                            Manage
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className={`text-xs ${s.sub}`}>
        Owners see every product in Part-Time → Staff access. Changes need a two-factor sign-in and are recorded in
        the audit log.
      </p>

      {adding && (
        <AccessDialog
          s={s}
          title={`Add staff to ${productLabel}`}
          caps={caps}
          productLabel={productLabel}
          onClose={() => setAdding(false)}
          onSave={async (input, who) => {
            await apiFetchAuthed(`${BASE}/products/${product}/members`, {
              method: 'POST',
              body: JSON.stringify({ ...input, ...who }),
            });
            setAdding(false);
            await load();
          }}
        />
      )}
      {editing && (
        <AccessDialog
          s={s}
          title={`${editing.name ?? editing.email} in ${productLabel}`}
          caps={caps}
          productLabel={productLabel}
          initial={editing.staffMemberships.find((x) => x.product === product)}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await apiFetchAuthed(`${BASE}/people/${encodeURIComponent(editing.id)}/products/${product}`, {
              method: 'PUT',
              body: JSON.stringify(input),
            });
            setEditing(null);
            await load();
          }}
          onRemove={async () => {
            await apiFetchAuthed(`${BASE}/people/${encodeURIComponent(editing.id)}/products/${product}`, {
              method: 'DELETE',
            });
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AccessDialog({
  s,
  title,
  caps,
  productLabel,
  initial,
  onClose,
  onSave,
  onRemove,
}: {
  s: ReturnType<typeof skin>;
  title: string;
  caps: Capability[];
  productLabel: string;
  initial?: Membership;
  onClose: () => void;
  onSave: (input: AccessInput, who: { email: string; name?: string; jobTitle?: string }) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const isNew = !initial;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [admin, setAdmin] = useState(initial?.role === 'PRODUCT_ADMIN');
  const [perms, setPerms] = useState<Set<string>>(new Set(initial?.permissions ?? []));
  const [finance, setFinance] = useState(initial?.isFinance ?? false);
  const [start, setStart] = useState(dateInput(initial?.startsAt));
  const [end, setEnd] = useState(dateInput(initial?.endsAt));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const groups = useMemo(() => {
    const g: Record<string, Capability[]> = {};
    for (const c of caps) (g[c.domain] ??= []).push(c);
    return Object.entries(g);
  }, [caps]);

  const toggle = (k: string) =>
    setPerms((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function save() {
    setErr(null);
    if (isNew && !email.trim()) return setErr('Enter their afrizonemart.com account email.');
    if (!admin && perms.size === 0) return setErr('Pick at least one permission, or make them a Product Admin.');
    if (start && end && end < start) return setErr('The contract end date is before the start date.');
    setBusy(true);
    try {
      await onSave(
        {
          role: admin ? 'PRODUCT_ADMIN' : 'MEMBER',
          permissions: admin ? [] : Array.from(perms),
          isFinance: finance,
          startsAt: startIso(start),
          endsAt: endIso(end),
        },
        { email: email.trim(), name: name.trim() || undefined, jobTitle: jobTitle.trim() || undefined },
      );
    } catch (e) {
      setErr(explain(e, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onRemove) return;
    setBusy(true);
    setErr(null);
    try {
      await onRemove();
    } catch (e) {
      setErr(explain(e, 'Could not remove access.'));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal>
      <div className={`my-8 w-full max-w-2xl rounded-lg p-5 shadow-xl ${s.modal}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className={`text-sm ${s.sub}`} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {isNew && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-semibold">Their afrizonemart.com account email</span>
                <input className={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <span className={`mt-1 block text-xs ${s.sub}`}>
                  They need an account first: ask them to sign up at afrizonemart.com, then add them here.
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Name (optional)</span>
                <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Job title (optional)</span>
                <input className={s.input} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </label>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
            <span>
              <span className="font-semibold">Product Admin of {productLabel}</span>
              <span className={`block text-xs ${s.sub}`}>
                Everything in {productLabel}, including adding and removing its staff. Nothing in other products.
              </span>
            </span>
          </label>

          {!admin && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">What they can do</p>
              {groups.map(([domain, list]) => (
                <div key={domain} className={`rounded-md border p-3 ${s.line}`}>
                  <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${s.sub}`}>{domain}</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {list.map((c) => (
                      <label key={c.key} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={perms.has(c.key)} onChange={() => toggle(c.key)} />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={finance} onChange={(e) => setFinance(e.target.checked)} />
            <span>
              <span className="font-semibold">Finance person for {productLabel}</span>
              <span className={`block text-xs ${s.sub}`}>Approves {productLabel}&apos;s money actions.</span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Contract starts</span>
              <input className={s.input} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Contract ends (optional)</span>
              <input className={s.input} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              <span className={`mt-1 block text-xs ${s.sub}`}>Access stops automatically after this date.</span>
            </label>
          </div>

          {err && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div>
              {onRemove &&
                (confirmRemove ? (
                  <span className="flex items-center gap-2 text-sm">
                    Remove their {productLabel} access?
                    <button className={s.danger} onClick={remove} disabled={busy}>
                      Yes, remove
                    </button>
                    <button className={s.ghost} onClick={() => setConfirmRemove(false)} disabled={busy}>
                      No
                    </button>
                  </span>
                ) : (
                  <button className={s.danger} onClick={() => setConfirmRemove(true)} disabled={busy}>
                    Remove from {productLabel}
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <button className={s.ghost} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className={s.primary} onClick={save} disabled={busy}>
                {busy ? 'Saving…' : isNew ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
