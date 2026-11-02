'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { completeMfaSignIn, friendlyAuthError, isMfaChallenge, loginUser } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/authStore';

/**
 * Same credential as every other Afrizonemart surface — a real login
 * form (not a redirect) since this is a separate origin, same reason
 * as afrizonemart-v2-supplier's /login. Doesn't branch on role at
 * sign-in time; RequireAdmin on the destination page handles the
 * ADMIN-only check and shows the denial state for anyone else.
 */
export default function HudLoginPage() {
  return (
    <Suspense fallback={null}>
      <HudLoginForm />
    </Suspense>
  );
}

function HudLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the account has 2FA on: the password was right, now the code. */
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  // Recovery codes (ABCD-EFGH) have letters, so they need the full keyboard on phones.
  const [recovery, setRecovery] = useState(false);

  const raw = searchParams.get('returnUrl');
  const isSafe = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//');
  const target = isSafe ? raw : '/';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mfaToken) {
        setSession(await completeMfaSignIn(mfaToken, code.trim()));
        router.push(target);
        return;
      }
      const result = await loginUser({ email, password });
      if (isMfaChallenge(result)) {
        setMfaToken(result.mfaToken);
        return;
      }
      setSession(result);
      router.push(target);
    } catch (err) {
      setError(friendlyAuthError(err, 'Access denied.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="hud-corners hud-panel w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-amber/40 text-amber shadow-glow-sm">
            <ShieldAlert size={20} aria-hidden />
          </span>
          <div>
            <h1 className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-amber text-glow">
              HUD Access
            </h1>
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-amber/40">
              Afrizonemart {'//'} Admin Only
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded border border-danger/40 bg-danger/10 px-3 py-2.5 font-mono text-xs text-danger"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mfaToken ? (
            <>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber/60">
              {recovery ? 'Recovery code' : 'Authenticator code'}
            </span>
            <input
              key={recovery ? 'recovery' : 'totp'}
              required
              inputMode={recovery ? 'text' : 'numeric'}
              autoComplete={recovery ? 'off' : 'one-time-code'}
              autoCapitalize={recovery ? 'characters' : undefined}
              autoCorrect="off"
              spellCheck={false}
              placeholder={recovery ? 'ABCD-EFGH' : '123456'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              className={`${inputClass} tracking-[0.3em]`}
            />
            <span className="font-mono text-[10px] text-amber/40">
              {recovery ? 'One of the codes you saved when you turned on 2FA. Each works once.' : '6-digit code from your authenticator app.'}
            </span>
          </label>
          <button
            type="button"
            onClick={() => { setRecovery((v) => !v); setCode(''); setError(null); }}
            className="self-start font-mono text-[10px] font-bold uppercase tracking-widest text-amber/70 hover:text-amber"
          >
            {recovery ? 'Use authenticator code' : 'Lost your phone? Use a recovery code'}
          </button>
            </>
          ) : (
            <>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber/60">
              Identifier
            </span>
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber/60">
              Passphrase
            </span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>

            </>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex items-center justify-center gap-2 rounded border border-amber bg-amber/10 py-3 font-mono text-xs font-bold uppercase tracking-widest text-amber shadow-glow-sm transition-all hover:bg-amber/20 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Authenticating…' : mfaToken ? 'Verify code' : 'Authenticate'}
            <ArrowRight size={14} aria-hidden />
          </button>
        </form>
        {mfaToken ? (
          <button
            type="button"
            onClick={() => { setMfaToken(null); setCode(''); setError(null); }}
            className="mt-4 w-full font-mono text-[10px] uppercase tracking-widest text-amber/50 hover:text-amber"
          >
            Use a different account
          </button>
        ) : null}
      </div>
    </main>
  );
}

const inputClass =
  'w-full rounded border border-amber/25 bg-void px-3 py-2.5 font-mono text-sm text-amber placeholder:text-amber/30 focus:border-amber focus:outline-none';
