// Shrinks a phone photo in the browser before it is sent to a server action.
//
// Why (נסיה, 2026-10-11: "מצלמים וקובץ לא עולה"): a request to the server is
// capped at 4.5 MB on Vercel. Of 152 uploaded case documents the largest is
// 4.45 MB and none is above 4.5 MB, while camera photos are often bigger —
// those were simply refused. A 2560px JPEG keeps a photographed estimate
// readable at a fraction of the size.

const MAX_SIDE = 2560;
const QUALITY = 0.85;
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;

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
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}

/** Several photos in ONE request (painter request) share the 4.5 MB: pass
 *  a smaller maxSide there.
 *
 *  Returns a smaller JPEG for large photos; any other file (PDF, small image,
 *  a format the browser cannot decode) is returned unchanged. Never throws. */
export async function shrinkImage(file: File, opts: { maxSide?: number } = {}): Promise<File> {
  const maxSide = opts.maxSide ?? MAX_SIDE;
  if (typeof window === 'undefined') return file;
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size < (opts.maxSide ? 400 * 1024 : SKIP_BELOW_BYTES)) return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff'; // transparent PNG areas would turn black in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
