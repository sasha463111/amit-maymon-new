// Storage object keys must be ASCII (16/10: Supabase Storage answers
// "Invalid key" for Hebrew — Ilanit's "גססה-זנה.pdf" never uploaded, and no
// Hebrew-named file ever did). The original name is kept in the DB row
// (file_name) and shown to people; only the key is made safe.

/** "צילום רישיון.PDF" → "pdf"; no / odd extension → fallback. */
export function safeExt(name: string, fallback = 'bin'): string {
  const m = name.match(/\.([A-Za-z0-9]{1,8})$/);
  return m ? m[1].toLowerCase() : fallback;
}

/** An ASCII file name for a storage key: English letters, digits, . _ - only;
 *  a name with nothing left (all Hebrew) becomes "file.<ext>". */
export function storageFileName(name: string, max = 80): string {
  const ext = safeExt(name, '');
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, max);
  return `${base || 'file'}${ext ? '.' + ext : ''}`;
}
