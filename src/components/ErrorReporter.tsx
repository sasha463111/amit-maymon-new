'use client';

import { useEffect } from 'react';
import { reportClientError, type ClientError } from '@/app/actions/errorReport';

// #43 (15/10): sends errors to the in-house monitor (app_errors → auto BUG
// ticket). Error boundaries call reportError(); this component catches the
// unhandled ones. Per page load: each error once, at most 5 reports.

const sent = new Set<string>();

// Browser noise that isn't ours / isn't a bug.
// Version skew (an old tab after a deploy) is not a bug — UpdateBanner tells the user to refresh.
const IGNORE = [/Server Action .*not found|Failed to find Server Action|unexpected response was received from the server/i, /ResizeObserver loop/i, /^Script error\.?$/i, /chrome-extension:|moz-extension:|safari-extension:/i, /Loading chunk \d+ failed|ChunkLoadError/i, /NEXT_REDIRECT|NEXT_NOT_FOUND/, /AbortError|The user aborted a request/i, /Failed to fetch|NetworkError|Load failed/i];

export function reportError(source: ClientError['source'], err: unknown, digest?: string) {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err ?? null));
    const message = e.message || String(err);
    const text = `${message}\n${e.stack ?? ''}`;
    if (IGNORE.some((r) => r.test(text))) return;
    const key = `${source}|${digest ?? message}`;
    if (sent.has(key) || sent.size >= 5) return;
    sent.add(key);
    void reportClientError({ source, message, digest, path: window.location.pathname, stack: e.stack });
  } catch {
    // never throw from the reporter
  }
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => reportError('window', ev.error ?? ev.message);
    const onRejection = (ev: PromiseRejectionEvent) => reportError('promise', ev.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
