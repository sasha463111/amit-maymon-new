'use client';

import { useEffect, useState } from 'react';
import { savePushSubscription, removePushSubscription } from '@/app/actions/push';

export type PushStatus =
  | 'unknown'
  | 'unsupported'
  | 'ios-needs-pwa'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

function detectIosNeedsPwa(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // iOS only allows web push when installed as a home-screen app.
  const isStandalone =
    'standalone' in navigator
      ? (navigator as unknown as { standalone?: boolean }).standalone === true
      : window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !isStandalone;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} לקח יותר מדי זמן. רענן ונסה שוב.`)), ms);
    }),
  ]);
}

async function waitForServiceWorkerActive(
  reg: ServiceWorkerRegistration
): Promise<ServiceWorkerRegistration> {
  if (reg.active) return reg;
  const worker = reg.installing ?? reg.waiting;
  if (!worker) return reg;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Service Worker לא הופעל בזמן')), 8000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeout);
        resolve();
      }
    });
  });
  return reg;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration('/');
}

/**
 * Shared push-subscription state + actions. Used by both the small in-bell
 * PushSubscriber control and the prominent top PushEnableBanner, so the enable
 * flow lives in exactly one place.
 */
/**
 * True unless we can positively tell the subscription was created with a
 * different VAPID public key. Some browsers don't expose the key; then we
 * can't tell, so we keep the subscription rather than churn it.
 */
function subscriptionMatchesKey(sub: PushSubscription, vapidKey: string): boolean {
  const raw = sub.options?.applicationServerKey;
  if (!raw) return true;
  const have = new Uint8Array(raw);
  const want = urlBase64ToUint8Array(vapidKey);
  if (have.length !== want.length) return false;
  for (let i = 0; i < have.length; i++) if (have[i] !== want[i]) return false;
  return true;
}

/**
 * The browser's existing subscription if it was made with the current VAPID
 * key; otherwise a fresh one. Found 2026-10-07: every push to Amit failed
 * (Apple 403 BadJwtToken, FCM "VAPID credentials do not correspond to the
 * credentials used to create the subscriptions") on all ten devices. A
 * subscription is bound to the public key it was created with; this code
 * used to reuse whatever subscription the browser already had, so after a
 * key change the device kept a subscription the server can never sign for.
 */
async function freshSubscription(reg: ServiceWorkerRegistration, vapidKey: string): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription();
  if (existing && subscriptionMatchesKey(existing, vapidKey)) return existing;
  if (existing) {
    await removePushSubscription(existing.endpoint).catch(() => {});
    await existing.unsubscribe().catch(() => {});
  }
  return withTimeout(
    reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    }),
    10000,
    'יצירת הרשמת Push'
  );
}

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (detectIosNeedsPwa()) {
      setStatus('ios-needs-pwa');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    navigator.serviceWorker
      .getRegistration('/')
      .then(async (reg) => {
        if (!reg) {
          setStatus('unsubscribed');
          return;
        }
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          setStatus('unsubscribed');
          return;
        }
        // A subscription made with an old VAPID key can never receive a push.
        // Permission is already granted, so replace it silently.
        if (vapidKey && Notification.permission === 'granted' && !subscriptionMatchesKey(sub, vapidKey)) {
          try {
            sub = await freshSubscription(reg, vapidKey);
          } catch {
            setStatus('unsubscribed');
            return;
          }
        }
        // Browser already has a subscription — refresh the DB row quietly in
        // case an earlier save failed.
        const json = sub.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          await savePushSubscription(
            { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
            navigator.userAgent
          ).catch(() => {});
        }
        setStatus('subscribed');
      })
      .catch(() => setStatus('unsubscribed'));
  }, []);

  async function enable() {
    setError(null);
    if (!vapidKey) {
      setError('Push לא מוגדר בשרת (חסר VAPID public key). פנה למפתח.');
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'unsubscribed');
        setError(
          perm === 'denied'
            ? 'הדפדפן חסם התראות. שנה בהגדרות האתר ונסה שוב.'
            : 'דחית את ההרשאה — נסה שוב.'
        );
        return;
      }

      const reg = await withTimeout(
        navigator.serviceWorker.register('/push-sw.js', { scope: '/' }),
        10000,
        'רישום ההתראות'
      );
      await withTimeout(waitForServiceWorkerActive(reg), 10000, 'הפעלת ההתראות');

      const sub = await freshSubscription(reg, vapidKey);

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError('הדפדפן לא החזיר מפתחות תקינים — נסה שוב.');
        return;
      }

      const res = await withTimeout(
        savePushSubscription(
          { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
          navigator.userAgent
        ),
        10000,
        'שמירת ההרשמה'
      );

      if (res?.error) {
        setError(`שמירה ל-DB נכשלה: ${res.error}`);
        await sub.unsubscribe().catch(() => {});
        return;
      }
      setStatus('subscribed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה בהפעלת push');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      const reg = await getPushRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setStatus('unsubscribed');
    } finally {
      setBusy(false);
    }
  }

  return { status, busy, error, enable, disable };
}
