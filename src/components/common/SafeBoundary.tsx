'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface SafeBoundaryProps {
  /** Telemetry tag — shows up in console/error tracking as
   *  `boundary:<name>` so you can see which section is failing. */
  name: string;
  /** What to render when the wrapped tree throws. Defaults to `null`
   *  — the section just disappears, the rest of the page renders fine. */
  fallback?: ReactNode;
  /** Optional callback for telemetry beyond console (Sentry etc. —
   *  not wired up yet in this repo, see afrizonemart-v2's version for
   *  the lazy-loaded Sentry pattern to mirror once this platform gets
   *  its own error tracking). */
  onError?: (err: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

interface SafeBoundaryState {
  hasError: boolean;
}

/**
 * Section-level fault isolation.
 *
 * Wrap any non-critical UI block in a <SafeBoundary> so a throw inside
 * it can't crash its siblings or the rest of the page.
 */
export class SafeBoundary extends Component<SafeBoundaryProps, SafeBoundaryState> {
  state: SafeBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SafeBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error(`[SafeBoundary:${this.props.name}]`, error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
