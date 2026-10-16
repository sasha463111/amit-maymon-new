import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { caseByTrackToken } from '@/lib/caseTrack.server';
import { TRACK_STEPS } from '@/lib/caseTrack';
import { LicensePlate } from '@/components/ui/LicensePlate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'מרכז שירות תהילה — מעקב רכב',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// "מעקב רכב" — the customer's personal link (16/10, design round): where the
// car is in the repair, like a delivery tracker. Public; shows only the first
// name, plate, car, branch and stage (caseTrack.server.ts).

const PHONE = '08-9933818';
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'short', day: '2-digit', month: '2-digit' }) : '');

export default async function TrackPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const v = await caseByTrackToken(params.token);
  return (
    <main className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="font-bold text-gray-900">מרכז שירות תהילה</div>
            <div className="text-xs text-gray-600">מעקב אחרי הרכב שלך{v?.branchName ? ` · סניף ${v.branchName}` : ''}</div>
          </div>
        </div>

        {!v ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center space-y-2">
            <p className="font-bold text-gray-900">הקישור לא פעיל</p>
            <p className="text-sm text-gray-600">ייתכן שתוקפו פג או שנשלח קישור חדש. לבירור — {PHONE}</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-gray-700">{v.firstName ? `שלום ${v.firstName},` : 'שלום,'}</p>
                {v.plate && <LicensePlate plate={v.plate} size="sm" />}
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 leading-snug">
                {v.step >= TRACK_STEPS.length ? 'הרכב נמסר ✓' : v.step === 4 ? 'הרכב מוכן לאיסוף!' : `הרכב בשלב: ${TRACK_STEPS[v.step]}`}
              </h1>
              <p className="text-gray-700">{v.note}</p>
              {v.vehicle && <p className="text-sm text-gray-500">{v.vehicle}</p>}
            </div>

            <ol className="bg-white rounded-2xl border border-gray-200 p-4">
              {TRACK_STEPS.map((label, i) => {
                const done = i < v.step || (i === 4 && v.step >= 4);
                const current = i === v.step && v.step < 4;
                return (
                  <li key={label} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                          done ? 'bg-green-600 text-white' : current ? 'bg-white border-[3px] border-amber-600' : 'bg-gray-200'
                        }`}
                        aria-hidden="true"
                      >
                        {done ? '✓' : ''}
                      </span>
                      {i < TRACK_STEPS.length - 1 && <span className={`w-0.5 flex-1 min-h-[28px] ${done ? 'bg-green-600' : 'bg-gray-200'}`} />}
                    </div>
                    <div className="pb-4">
                      <p className={`font-semibold ${current ? 'text-amber-800' : done ? 'text-gray-900' : 'text-gray-500'}`}>
                        {label}
                        {current && <span className="text-xs font-bold"> · עכשיו</span>}
                        <span className="sr-only">{done ? ' (הושלם)' : current ? ' (השלב הנוכחי)' : ' (בהמשך)'}</span>
                      </p>
                      {i === 0 && v.openedAt && <p className="text-xs text-gray-500">{fmt(v.openedAt)}</p>}
                      {current && v.since && <p className="text-xs text-gray-500">מאז {fmt(v.since)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${PHONE.replace(/\D/g, '')}`} className="h-12 rounded-xl bg-gray-900 text-white font-bold flex items-center justify-center">📞 להתקשר</a>
              <a href={`https://wa.me/972${PHONE.replace(/\D/g, '').slice(1)}`} className="h-12 rounded-xl border-2 border-gray-300 bg-white font-semibold flex items-center justify-center">וואטסאפ</a>
            </div>
            <p className="text-[11px] text-gray-500 text-center">הקישור אישי. המידע מתעדכן אוטומטית בכל שלב.</p>
          </>
        )}
      </div>
    </main>
  );
}
