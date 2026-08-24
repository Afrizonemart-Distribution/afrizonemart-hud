import type { ApiErrorEnvelope } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  /// E.164 phone, set via phone-OTP signup or /account/profile. Null
  /// when the user has only an email-based account.
  phone: string | null;
  /// Avatar URL, typically populated by Google sign-in.
  avatarUrl: string | null;
  role: string;
  /// Free-form job title for staff. Cosmetic — used in the dashboard
  /// greeting and admin staff list. Permissions still drive access.
  jobTitle: string | null;
  /// Effective capabilities — sidebar filter + per-section gate use this.
  /// ADMIN gets every capability. STAFF gets per-user grants. SELLER gets
  /// role defaults. CUSTOMER gets none.
  permissions: string[];
  /// Tracker #48 — marketing consent flags. Surfaced so the
  /// profile page can render the current state without an extra
  /// fetch, and so future feature gates ("only show newsletter
  /// banner to opted-in users") have the signal locally.
  marketingOptIn: boolean;
  smsOptIn: boolean;
  /// Afrizonemart Wrap opt-out. Optional so older API builds (before
  /// PR 8) don't break the type. true = excluded from the wrap.
  wrapOptOut?: boolean;
  /// 2026-05-16 Phase 2 — captured for the birthday-bonus cron.
  /// Stored as ISO yyyy-mm-dd (UTC midnight) when set; null
  /// otherwise. Optional in the type so older API builds don't
  /// crash this field.
  birthDate?: string | null;
  createdAt: string;
}

/**
 * The API now sets the refresh token as an httpOnly cookie. Only the
 * access token comes back in the JSON body — the refresh token never
 * touches JavaScript.
 */
export interface AuthResult {
  user: AuthUser;
  accessToken: string;
}

export class AuthApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;
  /// Seconds until the rate limit resets — only set on 429
  /// `RATE_LIMITED` responses. Parsed from the `Retry-After` header
  /// (RFC 7231) which `express-rate-limit` sets when
  /// `standardHeaders: true`. UI uses this to render an accurate
  /// "Try again in N minutes" message instead of the generic
  /// canned copy.
  public readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Format a `retryAfterSeconds` value into "N seconds" / "N minutes" /
 * "N minutes". Used by auth pages to surface rate-limit errors with
 * the actual wait time instead of the canned "wait an hour" copy.
 *
 * Returns null for missing / non-positive inputs so callers can
 * fall back to the server's message verbatim.
 */
export function formatRetryAfter(seconds?: number): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  if (seconds < 60) {
    return `${Math.ceil(seconds)} seconds`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * Render an auth-error into a customer-facing string. Auth pages all
 * have the same pattern (try/catch with `setError(...)`); this is
 * the single function each of them should call so rate-limit errors
 * get the live "Try again in N minutes" treatment instead of the
 * canned "wait an hour" message from the server.
 *
 * Non-rate-limit errors fall through to the server's message with
 * the optional `fallback` for non-AuthApiError throws.
 */
export function friendlyAuthError(err: unknown, fallback: string): string {
  if (!(err instanceof AuthApiError)) return fallback;
  if (err.code === 'RATE_LIMITED') {
    const wait = formatRetryAfter(err.retryAfterSeconds);
    if (wait) return `Too many requests from this network. Try again in ${wait}.`;
  }
  return err.message;
}

/**
 * Parse `Retry-After` header. RFC 7231 allows either a delta-seconds
 * integer ("60") or an HTTP-date ("Wed, 21 Oct 2015 07:28:00 GMT").
 * Returns the seconds-until-retry as a number, or undefined if the
 * header is absent / unparseable.
 */
function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get('Retry-After');
  if (!raw) return undefined;
  const asInt = Number(raw);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.round((asDate - Date.now()) / 1000));
  }
  return undefined;
}

async function authFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let envelope: ApiErrorEnvelope | undefined;
    try {
      envelope = (await res.json()) as ApiErrorEnvelope;
    } catch {
      /* not JSON */
    }
    throw new AuthApiError(
      res.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? `Request failed with status ${res.status}`,
      envelope?.error?.details,
      res.status === 429 ? parseRetryAfter(res.headers) : undefined,
    );
  }

  return (await res.json()) as T;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  /// Tracker #48 — marketing opt-in checkbox on signup. Default
  /// false; only sent true when the customer explicitly ticks the box.
  marketingOptIn?: boolean;
  smsOptIn?: boolean;
  /// 2026-05-16 Phase 2 — referral code captured from `?ref=` on
  /// the landing URL. Server validates + attributes silently;
  /// unknown codes don't fail signup.
  referralCode?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export function registerUser(body: RegisterInput): Promise<AuthResult> {
  return authFetch<AuthResult>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function loginUser(body: LoginInput): Promise<AuthResult> {
  return authFetch<AuthResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function refreshSession(): Promise<AuthResult> {
  return authFetch<AuthResult>('/api/auth/refresh', { method: 'POST' });
}

export function logoutUser(accessToken: string): Promise<void> {
  return authFetch<void>('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function getMe(accessToken: string): Promise<AuthUser> {
  return authFetch<AuthUser>('/api/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export interface UpdateMeInput {
  name?: string;
  /// E.164 phone (e.g. "+2348012345678"). Server validates the format
  /// and rejects with 400 on bad input or 409 if already taken by
  /// another account.
  phone?: string;
  /// Tracker #48 — marketing consent toggles. Pass either to
  /// update; omit to leave unchanged.
  marketingOptIn?: boolean;
  smsOptIn?: boolean;
  /// Afrizonemart Wrap opt-out toggle. true = exclude from the wrap.
  wrapOptOut?: boolean;
  /// 2026-05-16 Phase 2 — ISO yyyy-mm-dd; pass null to clear.
  birthDate?: string | null;
  /// 2026-05-21 — self-service profile picture. Upload the image
  /// first via POST /api/uploads/avatar, then PATCH the returned
  /// URL here. Pass null to clear.
  avatarUrl?: string | null;
}

/**
 * Update the signed-in user's mutable profile fields. Returns the
 * fresh `AuthUser` shape — caller should pass it through
 * `useAuthStore.setUser()` to keep the store in sync without a full
 * `setSession()` (which would also reset the access token).
 */
export function updateMe(
  accessToken: string,
  input: UpdateMeInput,
): Promise<AuthUser> {
  return authFetch<AuthUser>('/api/auth/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

/// 2026-06-05 — Play Store compliance: in-app account deletion.
/// Server requires `confirmation = "DELETE MY ACCOUNT"` exactly.
/// Returns 204 on success. The refresh cookie is cleared on the
/// server side; client should also clear local auth state.
export function deleteAccount(
  accessToken: string,
  input: { confirmation: string; reason?: string | null },
): Promise<void> {
  return authFetch<void>('/api/auth/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function requestPasswordReset(email: string): Promise<void> {
  return authFetch<void>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return authFetch<void>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function signInWithGoogle(idToken: string, nonce: string): Promise<AuthResult> {
  return authFetch<AuthResult>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken, nonce }),
  });
}

/// Phase 11.3 (audit H7): server-issued single-use nonce for the
/// GIS popup. Fetch one before calling
/// `google.accounts.id.initialize({ nonce })` and post it back with
/// the credential — the API consumes it atomically.
export interface GoogleChallenge {
  nonce: string;
  expiresAt: string;
}
export function createGoogleChallenge(): Promise<GoogleChallenge> {
  return authFetch<GoogleChallenge>('/api/auth/google/challenge', {
    method: 'POST',
  });
}

export function startPhoneVerification(phone: string): Promise<{ status: string }> {
  return authFetch<{ status: string }>('/api/auth/phone/start', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function verifyPhoneAndSignIn(phone: string, code: string): Promise<AuthResult> {
  return authFetch<AuthResult>('/api/auth/phone/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}
