'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "📷 צלם" that collects several photos before uploading (Amit, 2026-10-13:
 * the camera used to upload every single shot at once and close — taking 6
 * photos meant 6 round trips). Each shot lands in a tray of thumbnails (✕ to
 * drop a bad one); "⬆️ העלה הכל (N)" sends them together through the screen's
 * existing upload function, which is unchanged.
 */
export function CameraBatchUpload({
  onUpload,
  disabled = false,
  className,
  label = '📷 צלם',
}: {
  onUpload: (files: File[]) => Promise<void>;
  disabled?: boolean;
  className: string;
  label?: string;
}) {
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  // Free the thumbnail URLs when the component goes away.
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  function add(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.size > 0);
    if (!list.length) return;
    setShots((prev) => [...prev, ...list.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  function remove(i: number) {
    setShots((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  async function uploadAll() {
    if (!shots.length) return;
    setBusy(true);
    try {
      await onUpload(shots.map((s) => s.file));
      shots.forEach((s) => URL.revokeObjectURL(s.url));
      setShots([]);
    } finally {
      setBusy(false);
    }
  }

  const cameraInput = (
    <input
      type="file"
      accept="image/*"
      capture="environment"
      multiple
      className="hidden"
      disabled={disabled || busy}
      onChange={(e) => {
        add(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (!shots.length) {
    return (
      <label className={`${className} ${disabled ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
        {cameraInput}
        {label}
      </label>
    );
  }

  return (
    <div className="w-full rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 space-y-2" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {shots.map((s, i) => (
          <div key={s.url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt={`תמונה ${i + 1}`} className="w-16 h-16 object-cover rounded-md border border-gray-200" />
            {!busy && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] leading-none flex items-center justify-center shadow"
                aria-label="הסר תמונה"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`px-3 py-2 rounded-lg border border-blue-300 bg-white text-blue-700 text-sm font-semibold ${busy ? 'opacity-50' : 'cursor-pointer hover:bg-blue-50'}`}>
          {cameraInput}
          📷 עוד תמונה
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void uploadAll()}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'מעלה…' : `⬆️ העלה הכל (${shots.length})`}
        </button>
        {!busy && (
          <button
            type="button"
            onClick={() => {
              shots.forEach((s) => URL.revokeObjectURL(s.url));
              setShots([]);
            }}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            ביטול
          </button>
        )}
      </div>
    </div>
  );
}
