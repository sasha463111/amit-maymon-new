'use client';

import { useCallback, useEffect, useState } from 'react';

// Remember a screen's tab / filter on this device (16/10, UI round): coming
// back to a screen opens where you left it instead of the default. The first
// render uses `initial` (same as the server — no hydration mismatch), then the
// stored value is applied. `valid` rejects stale values (a removed tab etc.).
export function useRemembered<T extends string>(key: string, initial: T, valid?: (v: string) => boolean): [T, (v: T) => void] {
  const storageKey = `tehila:${key}`;
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v !== null && v.length < 100 && (!valid || valid(v))) setValue(v as T);
    } catch {
      // storage blocked — defaults only
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(storageKey, v);
      } catch {
        // storage blocked — this visit only
      }
    },
    [storageKey],
  );
  return [value, set];
}
