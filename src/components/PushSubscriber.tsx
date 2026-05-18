'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { savePushSubscription, removePushSubscription } from '@/app/actions/push';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

type Status = 'unknown' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export function PushSubscriber() {
  const [status, setStatus] = useState<Status>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    // Check existing subscription
    navigator.serviceWorker.getRegistration('/push-sw.js').then(async (reg) => {
      if (!reg) {
        setStatus('unsubscribed');
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? 'subscribed' : 'unsubscribed');
    }).catch(() => setStatus('unsubscribed'));
  }, []);

  async function enable() {
    setError(null);
    if (!vapidKey) {
      setError('Push לא מוגדר (חסר VAPID public key)');
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'unsubscribed');
        return;
      }
      const reg = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError('בעיה ביצירת הרשמת push');
        return;
      }
      const res = await savePushSubscription(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent
      );
      if (res?.error) {
        setError(res.error);
        await sub.unsubscribe().catch(() => {});
        return;
      }
      setStatus('subscribed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהפעלת push');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
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

  if (status === 'denied') {
    return (
      <div className="text-[11px] text-gray-500 px-3 py-2 bg-gray-50 border-t border-gray-100">
        🔕 Push חסום בדפדפן. שנה בהגדרות הדפדפן כדי לקבל התראות גם כשהאפליקציה סגורה.
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
      {error && <p className="text-red-600 mt-1">{error}</p>}
    </div>
  );
}
