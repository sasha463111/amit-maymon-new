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
        const sub = await reg.pushManager.getSubscription();
        if (!sub) {
          setStatus('unsubscribed');
          return;
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

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
          }),
          10000,
          'יצירת הרשמת Push'
        ));

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
