'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff, AlertCircle } from 'lucide-react';
import { savePushSubscription, removePushSubscription } from '@/app/actions/push';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

type Status = 'unknown' | 'unsupported' | 'ios-needs-pwa' | 'denied' | 'subscribed' | 'unsubscribed';

function detectIosNeedsPwa(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // iOS only allows web push when installed as a home-screen app.
  // `standalone` is true only when launched from home screen.
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

async function waitForServiceWorkerActive(reg: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
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

export function PushSubscriber() {
  const [status, setStatus] = useState<Status>('unknown');
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
    // Check existing subscription on the root scope.
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

        // If the browser already has a subscription but the DB missed it,
        // refresh the server row quietly. This fixes older broken attempts.
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
    console.log('[PushSubscriber] enable() called, vapidKey present:', !!vapidKey);

    if (!vapidKey) {
      setError('Push לא מוגדר בשרת (חסר VAPID public key). פנה למפתח.');
      return;
    }

    setBusy(true);
    try {
      // 1. Browser permission
      const perm = await Notification.requestPermission();
      console.log('[PushSubscriber] permission result:', perm);
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'unsubscribed');
        if (perm === 'denied') {
          setError('הדפדפן חסם התראות. שנה בהגדרות אתר ונסה שוב.');
        } else {
          setError('דחית את ההרשאה — נסה שוב.');
        }
        return;
      }

      // 2. Register our push worker at the root scope. We disabled next-pwa's
      // auto-registration, so this worker is the single source of truth for push.
      console.log('[PushSubscriber] registering /push-sw.js at root scope …');
      const reg = await withTimeout(
        navigator.serviceWorker.register('/push-sw.js', { scope: '/' }),
        10000,
        'רישום ההתראות'
      );
      await withTimeout(waitForServiceWorkerActive(reg), 10000, 'הפעלת ההתראות');
      console.log('[PushSubscriber] worker registered:', reg.scope);

      // 3. Subscribe to push
      console.log('[PushSubscriber] subscribing …');
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }),
        10000,
        'יצירת הרשמת Push'
      );
      const json = sub.toJSON();
      console.log('[PushSubscriber] got subscription, endpoint:', json.endpoint?.slice(0, 60));

      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError('הדפדפן לא החזיר מפתחות תקינים — נסה שוב.');
        return;
      }

      // 4. Save to DB
      console.log('[PushSubscriber] calling savePushSubscription …');
      const res = await withTimeout(
        savePushSubscription(
          { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
          navigator.userAgent
        ),
        10000,
        'שמירת ההרשמה'
      );
      console.log('[PushSubscriber] savePushSubscription result:', res);

      if (res?.error) {
        setError(`שמירה ל-DB נכשלה: ${res.error}`);
        await sub.unsubscribe().catch(() => {});
        return;
      }
      setStatus('subscribed');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'שגיאה לא ידועה בהפעלת push';
      console.error('[PushSubscriber] enable failed:', e);
      setError(message);
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

  if (status === 'unsupported') return null;
  if (status === 'unknown') return null;

  if (status === 'ios-needs-pwa') {
    return (
      <div className="px-3 py-2 text-[11px] bg-amber-50 border-t border-amber-100 text-amber-800">
        <p className="font-semibold flex items-center gap-1.5">
          <AlertCircle size={12} />
          ב-iPhone: יש להוסיף לבית
        </p>
        <p className="mt-0.5 leading-tight">
          לחץ על כפתור השיתוף בספארי ⇧ ובחר &quot;הוסף למסך הבית&quot;. אחרי הפעלת האפליקציה מהבית תוכל להפעיל push.
        </p>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="text-[11px] text-gray-500 px-3 py-2 bg-gray-50 border-t border-gray-100">
        🔕 Push חסום בדפדפן. שנה בהגדרות הדפדפן (settings → site permissions → notifications) ואז רענן.
      </div>
    );
  }

  if (status === 'subscribed') {
    return (
      <div className="flex items-center justify-between px-3 py-2 text-[11px] bg-green-50 border-t border-green-100">
        <span className="text-green-700 flex items-center gap-1.5">
          <BellRing size={12} />
          התראות push פעילות
        </span>
        <button
          type="button"
          onClick={() => void disable()}
          disabled={busy}
          className="text-gray-500 hover:text-red-600 underline"
        >
          {busy ? '...' : 'כבה'}
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 text-[11px] bg-blue-50 border-t border-blue-100">
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="flex items-center gap-1.5 text-blue-700 font-semibold hover:underline disabled:opacity-50"
      >
        <BellOff size={12} />
        {busy ? 'מפעיל...' : 'הפעל התראות push (גם כשהאפליקציה סגורה)'}
      </button>
      {error && (
        <p className="text-red-700 mt-1.5 bg-red-50 border border-red-200 rounded px-2 py-1 break-words">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
