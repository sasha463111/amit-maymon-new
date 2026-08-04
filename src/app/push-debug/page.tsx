'use client';

import { useEffect, useState } from 'react';

type Info = Record<string, unknown>;

export default function PushDebug() {
  const [info, setInfo] = useState<Info>({});
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString('he-IL')} — ${s}`, ...l]);

  async function refresh() {
    const out: Info = {};
    try {
      out['standalone (מותקן מהבית?)'] =
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;
      out['Notification API'] = typeof Notification !== 'undefined';
      out['permission (הרשאה)'] = typeof Notification !== 'undefined' ? Notification.permission : 'אין API';
      out['serviceWorker נתמך'] = 'serviceWorker' in navigator;
      out['PushManager נתמך'] = 'PushManager' in window;
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        out['רישומי SW'] = regs.map((r) => ({
          scope: r.scope,
          active: r.active?.scriptURL ?? null,
          installing: r.installing?.scriptURL ?? null,
          waiting: r.waiting?.scriptURL ?? null,
        }));
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          out['הרשמת push קיימת'] = sub ? `כן — ${sub.endpoint.slice(0, 50)}…` : 'לא (NONE)';
        } else {
          out['הרשמת push קיימת'] = 'אין רישום SW בscope /';
        }
      }
    } catch (e) {
      out['שגיאה ברענון'] = e instanceof Error ? e.message : String(e);
    }
    setInfo(out);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function testLocal() {
    try {
      if (typeof Notification === 'undefined') return add('אין Notification API');
      if (Notification.permission !== 'granted') return add(`ההרשאה אינה granted (היא: ${Notification.permission}) — לחץ "בקש הרשאה"`);
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('בדיקה מקומית ✅', {
        body: 'אם הבאנר הזה הופיע — ה-SW וההרשאה תקינים, והבעיה היא במסירה מאפל.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'local-test',
      });
      add('✅ showNotification נקרא בהצלחה — תסתכל אם הופיע באנר (נעל את המסך אם צריך).');
    } catch (e) {
      add(`❌ showNotification נכשל: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function reqPerm() {
    try {
      const p = await Notification.requestPermission();
      add(`ההרשאה עכשיו: ${p}`);
      void refresh();
    } catch (e) {
      add(`שגיאה בבקשת הרשאה: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const btn: React.CSSProperties = {
    width: '100%', padding: '14px', margin: '6px 0', borderRadius: 10, border: 'none',
    background: '#B03C2F', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
  };

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif', direction: 'rtl', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22 }}>🔍 אבחון Push — תהילה</h1>
      <p style={{ color: '#666', fontSize: 14 }}>פתח את הדף הזה מתוך האפליקציה במסך הבית (לא מ-Safari).</p>

      <pre style={{ background: '#f4f1ec', padding: 14, borderRadius: 10, fontSize: 12, overflow: 'auto', direction: 'ltr', lineHeight: 1.5 }}>
        {JSON.stringify(info, null, 2)}
      </pre>

      <button style={btn} onClick={() => void testLocal()}>📣 בדוק התראה מקומית (החשוב!)</button>
      <button style={{ ...btn, background: '#0038b8' }} onClick={() => void reqPerm()}>🔑 בקש הרשאה</button>
      <button style={{ ...btn, background: '#555' }} onClick={() => void refresh()}>🔄 רענן מידע</button>

      <div style={{ marginTop: 16, fontSize: 13 }}>
        {log.map((l, i) => (
          <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>{l}</div>
        ))}
      </div>
    </div>
  );
}
