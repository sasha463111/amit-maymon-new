'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "📄 סריקת מסמך" (Tomer, 15/10 — the collectors upload the BAFI claim
 * documents themselves, case by case): photograph one or more pages with the
 * phone camera, each page is cleaned up to look like a scan (grayscale +
 * auto-contrast, so the paper turns white and the text dark), and all pages are
 * saved as ONE PDF through the screen's upload function.
 *
 * Everything happens in the browser (pdf-lib, loaded only when saving). The
 * PDF is kept under `maxBytes` (the server action limit) by lowering the
 * resolution / quality until it fits.
 *
 * On a computer (Sapir, 15/10 — no camera; the office scanner saves PDFs into
 * a "סריקות" folder, and the image-only picker hid them) the button opens a
 * file picker for images AND PDFs; a PDF's pages are copied as they are into
 * the one output PDF. On a phone it stays the camera.
 */

type Page = { file: File; url: string; pdf: boolean };

const STEPS: { side: number; quality: number }[] = [
  { side: 1800, quality: 0.72 },
  { side: 1500, quality: 0.62 },
  { side: 1200, quality: 0.55 },
  { side: 1000, quality: 0.5 },
];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

/** One page → JPEG bytes, optionally "scan look" (gray + stretched levels). */
async function pageJpeg(img: HTMLImageElement, side: number, quality: number, enhance: boolean): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  if (enhance) {
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      px[i] = y;
      hist[y | 0]++;
    }
    // Levels from the 2% darkest to the 90% point (paper → white).
    const total = w * h;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc < total * 0.02) lo = v;
      if (acc < total * 0.9) hi = v;
    }
    if (hi - lo < 40) hi = Math.min(255, lo + 40);
    const range = hi - lo;
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

async function buildPdf(pages: Page[], enhance: boolean, maxBytes: number): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  // Load every source once: an image, or a PDF from the scanner.
  const srcs = await Promise.all(
    pages.map(async (p) => (p.pdf ? { pdf: await PDFDocument.load(await p.file.arrayBuffer(), { ignoreEncryption: true }) } : { img: await loadImage(p.file) })),
  );
  let last: Uint8Array | null = null;
  for (const step of STEPS) {
    const pdf = await PDFDocument.create();
    for (const src of srcs) {
      if ('pdf' in src && src.pdf) {
        const copied = await pdf.copyPages(src.pdf, src.pdf.getPageIndices());
        copied.forEach((pg) => pdf.addPage(pg));
        continue;
      }
      const img = (src as { img: HTMLImageElement }).img;
      const j = await pageJpeg(img, step.side, step.quality, enhance);
      const embedded = await pdf.embedJpg(j.bytes);
      // A4 width (595pt), height by the photo's proportions.
      const pw = 595;
      const ph = (pw * j.h) / j.w;
      const page = pdf.addPage([pw, ph]);
      page.drawImage(embedded, { x: 0, y: 0, width: pw, height: ph });
    }
    last = await pdf.save();
    if (last.byteLength <= maxBytes) return last;
  }
  if (last && last.byteLength <= maxBytes) return last;
  throw new Error('too-big');
}

export function DocScanner({
  onSave,
  fileName,
  maxBytes = 3.8 * 1024 * 1024,
  disabled = false,
  label = '📄 סריקת מסמך',
  className,
}: {
  onSave: (pdf: File) => Promise<boolean>;
  fileName: string;
  maxBytes?: number;
  disabled?: boolean;
  label?: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [enhance, setEnhance] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Phone / tablet → the camera; computer → pick images or scanner PDFs.
  const [touch, setTouch] = useState(true);
  useEffect(() => {
    try {
      setTouch(window.matchMedia('(pointer: coarse)').matches);
    } catch {
      /* keep the camera default */
    }
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function add(list: FileList | null) {
    if (!list?.length) return;
    const next = Array.from(list)
      .filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
      .map((file) => {
        const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        return { file, pdf, url: pdf ? '' : URL.createObjectURL(file) };
      });
    setPages((p) => [...p, ...next]);
    setOpen(true);
    if (input.current) input.current.value = '';
  }

  function drop(i: number) {
    setPages((p) => {
      URL.revokeObjectURL(p[i].url);
      return p.filter((_, j) => j !== i);
    });
  }

  function move(i: number, d: -1 | 1) {
    setPages((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  function reset() {
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    setPages([]);
    setOpen(false);
    setErr(null);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const bytes = await buildPdf(pages, enhance, maxBytes);
      const ok = await onSave(new File([bytes as BlobPart], fileName, { type: 'application/pdf' }));
      if (ok) reset();
    } catch (e) {
      setErr(
        e instanceof Error && e.message === 'too-big'
          ? 'המסמך גדול מדי (עד 4MB) — נסו לחלק אותו לשתי שמירות, או לסרוק ברזולוציה נמוכה יותר.'
          : 'לא הצלחנו ליצור את ה-PDF (ייתכן שקובץ ה-PDF מוגן). אפשר להעלות אותו ב"בחירת קבצים".',
      );
    }
    setBusy(false);
  }

  return (
    <>
      <label className={`${className} ${disabled || busy ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
        {pages.length ? (touch ? '📷 עמוד נוסף' : '➕ עוד קובץ') : label}
        {touch ? (
          <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" disabled={disabled || busy} onChange={(e) => add(e.target.files)} />
        ) : (
          <input ref={input} type="file" multiple accept="image/*,application/pdf,.pdf" className="hidden" disabled={disabled || busy} onChange={(e) => add(e.target.files)} />
        )}
      </label>
      {open && pages.length > 0 && (
        <div className="w-full rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
          <p className="text-sm font-semibold">📄 סריקה — {pages.length} {pages.length === 1 ? 'פריט' : 'פריטים'} · יישמרו כקובץ PDF אחד</p>
          {!touch && <p className="text-xs text-gray-600">מהמחשב: בוחרים קבצים מתיקיית הסריקות (PDF או תמונה). כמה קבצים יאוחדו למסמך אחד, לפי הסדר כאן.</p>}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pages.map((p, i) => (
              <div key={`${i}-${p.file.name}-${p.file.size}`} className="shrink-0 w-24 space-y-1">
                {p.pdf ? (
                  <div className="w-24 h-32 rounded-lg border border-gray-300 bg-white flex flex-col items-center justify-center p-1 text-center">
                    <span className="text-3xl">📄</span>
                    <span className="text-[10px] text-gray-600 break-all line-clamp-3">{p.file.name}</span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={`עמוד ${i + 1}`} className={`w-24 h-32 object-cover rounded-lg border border-gray-300 bg-white ${enhance ? 'grayscale contrast-150' : ''}`} />
                )}
                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-20" aria-label="הזזה ימינה">→</button>
                  <span className="text-gray-600">{p.pdf ? `קובץ ${i + 1}` : `עמ׳ ${i + 1}`}</span>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === pages.length - 1} className="px-1 disabled:opacity-20" aria-label="הזזה שמאלה">←</button>
                </div>
                <button type="button" onClick={() => drop(i)} className="w-full text-xs text-red-600">✕ הסרה</button>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} className="w-4 h-4" />
            שיפור קריאות (שחור-לבן, כמו סורק) — לבטל לתמונות צבע
          </label>
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={busy} onClick={() => void save()} className="h-11 px-5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
              {busy ? 'שומר…' : `💾 שמירה לתיק (${pages.length})`}
            </button>
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="h-11 px-4 rounded-xl border border-gray-300 bg-white text-sm font-semibold">
              {touch ? '📷 עמוד נוסף' : '➕ עוד קובץ'}
            </button>
            <button type="button" disabled={busy} onClick={reset} className="h-11 px-4 rounded-xl text-sm text-gray-600 underline">
              ביטול
            </button>
          </div>
          {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
        </div>
      )}
    </>
  );
}
