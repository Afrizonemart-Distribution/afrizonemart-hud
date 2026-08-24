import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  type AuthResult,
  type AuthUser,
  refreshSession,
} from '@/lib/api/auth';

/**
 * Auth state.
 *
 * Security model (Phase 11.3 — closes audit finding C2):
 *  - **Refresh token** lives in an httpOnly cookie set by the API. JS
 *    never sees it.
 *  - **Access token** lives in **memory only**. It's NOT persisted to
 *    localStorage, so an XSS payload (eg. compromised admin in blog
 *    rich-text) can't lift a working API token from `azm-auth`.
 *  - **User** is persisted to localStorage so the UI doesn't blank
 *    out on reload.
 *  - On rehydrate, if a user exists but no access token, we eagerly
 *    call `/api/auth/refresh` once to mint a fresh access token from
 *    the cookie. If that fails (cookie expired / revoked), we clear
 *    the user — same behaviour as a real logout.
 */

/// Module-private singleton so concurrent rehydrates / 401 retries
/// share one in-flight refresh promise (closes audit finding M2 too).
let inflightRefresh: Promise<string | null> | null = null;

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  /// True while the post-rehydrate refresh (or any other refresh
  /// kicked off by `apiFetchAuthed` 401-retry) is in flight. Route
  /// guards (`RequireAuth`, `RequireAdmin`) wait for this to settle
  /// before deciding whether to redirect — otherwise we'd briefly
  /// kick a logged-in user back to /login on every page reload.
  refreshing: boolean;
  setSession: (result: AuthResult) => void;
  /// Replace just the `user` slice without touching the access token.
  /// Used by `/account/profile` after a successful PATCH /api/auth/me
  /// so the new name flows into the dashboard greeting + sidebar
  /// without re-authenticating.
  setUser: (user: AuthUser) => void;
  clear: () => void;
  /**
   * Try to mint a new access token using the httpOnly refresh cookie.
   * Returns the new access token on success, null if refresh failed
   * (in which case the local session has been cleared).
   *
   * Concurrent callers receive the same in-flight promise — no
   * duplicate refresh requests.
   */
  refresh: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshing: false,

      setSession: (result) =>
        set({ user: result.user, accessToken: result.accessToken }),

      setUser: (user) => set({ user }),

      clear: () => set({ user: null, accessToken: null, refreshing: false }),

      refresh: async () => {
        if (inflightRefresh) return inflightRefresh;
        set({ refreshing: true });
        inflightRefresh = (async () => {
          try {
            const result = await refreshSession();
            set({ user: result.user, accessToken: result.accessToken });
            return result.accessToken;
          } catch {
            set({ user: null, accessToken: null });
            return null;
          } finally {
            inflightRefresh = null;
            set({ refreshing: false });
          }
        })();
        return inflightRefresh;
      },
    }),
    {
      name: 'azm-auth',
      storage: createJSONStorage(() => localStorage),
      /// Persist ONLY the user. The access token stays in memory so a
      /// stored XSS attack against localStorage can never lift a
      /// working API credential. (Audit finding C2.)
      partialize: (state) => ({ user: state.user }),
      /// On rehydrate, if we restored a user but no access token,
      /// eagerly refresh from the httpOnly cookie. If refresh fails,
      /// the `clear()` inside `refresh()` drops the user — same
      /// behaviour as a real logout.
      onRehydrateStorage: () => (state) => {
        if (state?.user && !state.accessToken) {
          // Defer to the next tick so the store is fully constructed
          // before we call our own action.
          setTimeout(() => {
            void useAuthStore.getState().refresh();
          }, 0);
        }
      },
    },
  ),
);

/// "Are we logged in?" returns true when a `user` is in the store.
/// On reload, the user is rehydrated from storage immediately, while
/// the access token is fetched asynchronously via the refresh cookie.
/// Auth-gated UI relying on this hook will render "logged in" while
/// the token is being minted; `apiFetchAuthed` waits for the refresh
/// promise before sending the first request.
export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => Boolean(s.user));
}
