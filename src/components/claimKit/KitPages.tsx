'use client';

import { Fragment, useState } from 'react';
import { KIT_DOCS, KIT_FIELDS, VAT_OPTIONS, type KitBlock, type KitDoc, type KitFieldKey } from '@/lib/claimKit';

// The claim document kit as A4 pages (Amit, 15/10): a details page first, then
// each document typed cleanly with inline fields. A value typed once fills
// every document. Prints / saves as PDF (one document per page).

export type KitValues = Partial<Record<KitFieldKey, string>> & { vat_choice?: string };

function Field({ k, values, set }: { k: KitFieldKey; values: KitValues; set: (k: KitFieldKey, v: string) => void }) {
  const f = KIT_FIELDS[k];
  const v = values[k] ?? '';
  return (
    <input
      value={v}
      onChange={(e) => set(k, e.target.value)}
      dir={f.ltr ? 'ltr' : 'rtl'}
      aria-label={f.label}
      placeholder={f.label}
      style={{ width: `${Math.max(f.width ?? 10, v.length + 2)}ch` }}
      className="kit-field mx-1 border-0 border-b border-dotted border-gray-500 bg-sky-50/60 print:bg-transparent px-1 py-0 text-center font-semibold text-gray-900 outline-none focus:bg-sky-100 placeholder:text-gray-300 placeholder:font-normal print:placeholder:text-transparent"
    />
  );
}

function Text({ text, values, set }: { text: string; values: KitValues; set: (k: KitFieldKey, v: string) => void }) {
  const parts = text.split(/\{\{(\w+)\}\}/);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 && p in KIT_FIELDS ? <Field key={i} k={p as KitFieldKey} values={values} set={set} /> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

function Block({ b, values, set, setVat }: { b: KitBlock; values: KitValues; set: (k: KitFieldKey, v: string) => void; setVat: (v: string) => void }) {
  switch (b.t) {
    case 'p':
      return (
        <p className={`leading-9 ${b.bold ? 'font-bold' : ''}`}>
          <Text text={b.text} values={values} set={set} />
        </p>
      );
    case 'list':
      return (
        <ul className="list-disc pr-6 space-y-1">
          {b.items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      );
    case 'vat':
      return (
        <ol className="space-y-3">
          {VAT_OPTIONS.map((o, i) => {
            const on = values.vat_choice === String(i + 1);
            return (
              <li key={i}>
                <label className="flex gap-3 items-start cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => setVat(on ? '' : String(i + 1))} className="mt-2 w-5 h-5 shrink-0 accent-red-700" />
                  <span className="leading-8">
                    <b>{i + 1}.</b> {o}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      );
    case 'fields':
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 max-w-md">
          {b.keys.map((k) => (
            <Fragment key={k}>
              <dt className="text-gray-600 pt-1">{KIT_FIELDS[k].label}:</dt>
              <dd>
                <Field k={k} values={values} set={set} />
              </dd>
            </Fragment>
          ))}
        </dl>
      );
    case 'table':
      return (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {b.keys.map((k) => (
              <tr key={k}>
                <th className="border border-gray-400 bg-gray-50 px-2 py-2 text-right font-semibold w-40">{KIT_FIELDS[k].label}</th>
                <td className="border border-gray-400 px-1 py-1">
                  <Field k={k} values={values} set={set} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'handwrite':
      return (
        <div className="rounded-lg border border-dashed border-gray-400 p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-700">{b.label}</p>
          {b.lines.map((l) => (
            <p key={l} className="text-sm text-gray-700">
              {l}: <span className="inline-block w-56 border-b border-gray-500 align-bottom">&nbsp;</span>
            </p>
          ))}
        </div>
      );
    case 'sign':
      return (
        <div className="pt-8">
          <span className="inline-block w-64 border-b border-gray-700 h-10" />
          <p className="text-sm text-gray-600 mt-1">{b.label ?? 'חתימה'}</p>
        </div>
      );
    case 'draft':
      return <p className="print:hidden rounded-lg bg-amber-100 text-amber-900 text-sm px-3 py-2 font-semibold">⚠️ {b.text}</p>;
  }
}

function Letterhead({ kind }: { kind: KitDoc['letterhead'] }) {
  if (kind === 'shlomo') {
    return (
      <div className="flex items-end justify-between border-b-2 border-gray-800 pb-3">
        <div>
          <p className="text-2xl font-black tracking-tight text-gray-900">שלמה SIXT</p>
          <p className="text-sm text-gray-600">רשת מוסכים ושרותי דרך · מוקד ש.י.ר</p>
        </div>
        <p className="text-sm text-gray-600 text-left">באמצעות<br />מוסך תהילה בע״מ</p>
      </div>
    );
  }
  return (
    <div className="flex items-end justify-between border-b-2 border-red-700 pb-3">
      <div>
        <p className="text-3xl font-black text-red-700 leading-none">תהילה</p>
        <p className="text-sm text-gray-700 mt-1">סוכנות מורשית טויוטה</p>
        <p className="text-xs text-gray-500">המקצוענות שלנו, השקט שלך.</p>
      </div>
      <div className="text-left">
        <p className="text-lg font-black tracking-[0.2em] text-gray-800">TOYOTA</p>
        <p className="text-[10px] tracking-widest text-gray-500">ALWAYS A BETTER WAY</p>
      </div>
    </div>
  );
}

const FOOTER = 'מוסך תהילה בע״מ · ח.פ. 513539148 · סוכנות מורשית טויוטה · הקציר 857, נתיבות · www.toyota-tehila.co.il · 08-9933818';

function Page({ children, n, total }: { children: React.ReactNode; n: number; total: number }) {
  return (
    <section className="kit-page relative bg-white mx-auto shadow-md print:shadow-none border border-gray-200 print:border-0 w-full max-w-[210mm] min-h-[297mm] px-[16mm] pt-[14mm] pb-[22mm] text-[15px] text-gray-900">
      {children}
      <footer className="absolute bottom-[8mm] inset-x-[16mm] border-t border-gray-300 pt-2 flex justify-between text-[10px] text-gray-500">
        <span>{FOOTER}</span>
        <span>
          עמוד {n} מתוך {total}
        </span>
      </footer>
    </section>
  );
}

export function KitPages({ selected, values, setValues, summary }: { selected: string[]; values: KitValues; setValues: (v: KitValues) => void; summary: { label: string; value: string }[] }) {
  const docs = KIT_DOCS.filter((d) => selected.includes(d.id));
  const set = (k: KitFieldKey, v: string) => setValues({ ...values, [k]: v });
  const setVat = (v: string) => setValues({ ...values, vat_choice: v });
  const total = docs.length + 1;
  return (
    <div className="space-y-6 print:space-y-0" dir="rtl">
      <style>{`@media print { @page { size: A4; margin: 0; } .kit-page { page-break-after: always; break-after: page; } .kit-page:last-child { page-break-after: auto; } }`}</style>
      <Page n={1} total={total}>
        <Letterhead kind="tehila" />
        <h1 className="text-2xl font-black mt-6">קיט מסמכים לתביעה</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-4 text-sm">
          {summary.map((s) => (
            <Fragment key={s.label}>
              <dt className="text-gray-500">{s.label}:</dt>
              <dd className="font-semibold">{s.value || '—'}</dd>
            </Fragment>
          ))}
        </dl>
        <h2 className="text-lg font-bold mt-6 mb-2">פירוט המסמכים בקיט</h2>
        <ol className="space-y-3">
          {docs.map((d, i) => (
            <li key={d.id} className="rounded-xl border border-gray-200 p-3">
              <p className="font-bold">
                {i + 1}. {d.title}
                {d.subtitle ? <span className="font-normal text-gray-600"> — {d.subtitle}</span> : null}
                <span className="text-gray-400 font-normal text-xs"> (עמוד {i + 2})</span>
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm mt-1">
                <dt className="text-gray-500">מתי:</dt>
                <dd>{d.when}</dd>
                <dt className="text-gray-500">חותם:</dt>
                <dd>{d.signer}</dd>
                {d.attach && (
                  <>
                    <dt className="text-gray-500">לצרף:</dt>
                    <dd>{d.attach.join(' · ')}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ol>
      </Page>
      {docs.map((d, i) => (
        <Page key={d.id} n={i + 2} total={total}>
          <Letterhead kind={d.letterhead} />
          <div className="flex justify-between mt-5 text-sm">
            <span>{d.to ? <Text text={d.to} values={values} set={set} /> : null}</span>
            <span>
              תאריך: <Field k="date" values={values} set={set} />
            </span>
          </div>
          <h2 className="text-xl font-black text-center mt-6 underline underline-offset-4">{d.title}</h2>
          {d.subtitle && <p className="text-center text-gray-700 font-semibold">{d.subtitle}</p>}
          <div className="mt-6 space-y-4">
            {d.blocks.map((b, j) => (
              <Block key={j} b={b} values={values} set={set} setVat={setVat} />
            ))}
          </div>
        </Page>
      ))}
    </div>
  );
}
