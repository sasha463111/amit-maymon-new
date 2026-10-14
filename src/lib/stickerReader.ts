import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { PART_RETURN_SUPPLIERS } from '@/lib/partReturns';

// Reads a part's supplier sticker with Claude (Amit, 2026-10-14 — "like the
// system I built": photograph the sticker and the fields fill themselves).
// Claude Haiku: ~0.15 agora per sticker. The API key lives in Supabase Vault
// (secret "anthropic_api_key", read via get_app_secret — service role only),
// or ANTHROPIC_API_KEY in the environment. No key → returns null and the form
// simply stays manual, exactly as before.

const MODEL = 'claude-haiku-5-5';

export type StickerFields = {
  supplier: string | null;      // one of PART_RETURN_SUPPLIERS, or 'אחר'
  supplier_other: string | null;
  sku: string | null;
  description: string | null;
  plate: string | null;         // digits only
  sticker_date: string | null;  // YYYY-MM-DD
  quantity: number | null;
  document_number: string | null;
};

let cachedKey: { value: string | null; at: number } | null = null;

export async function apiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (cachedKey && Date.now() - cachedKey.at < 10 * 60_000) return cachedKey.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await db.rpc('get_app_secret' as never, { p_name: 'anthropic_api_key' } as never);
  const value = typeof data === 'string' && data.trim() ? data.trim() : null;
  cachedKey = { value, at: Date.now() };
  return value;
}

export async function stickerReadingAvailable(): Promise<boolean> {
  return !!(await apiKey());
}

const SUPPLIERS = PART_RETURN_SUPPLIERS.filter((s) => s !== 'אחר');

const TOOL = {
  name: 'report_sticker',
  description: 'Report the fields read from an Israeli auto-parts supplier sticker.',
  input_schema: {
    type: 'object',
    properties: {
      supplier: { type: 'string', enum: [...SUPPLIERS, 'אחר'], description: 'The supplier. "יוניון מוטורס" / Union Motors (Toyota importer) = "טויוטה". If none of the list matches, "אחר".' },
      supplier_other: { type: 'string', description: 'Supplier name as printed, only when supplier is "אחר".' },
      sku: { type: 'string', description: 'Part / catalog number (פריט / מק"ט / קוד פריט), e.g. 878100F010, PF2232. Not the barcode digits, not the order number.' },
      description: { type: 'string', description: 'Part description in Hebrew as printed (תאור פריט), e.g. "מראה פנימית", "מסנן שמן".' },
      plate: { type: 'string', description: 'Israeli vehicle licence plate (רישוי / מספר רכב / לרכב), 7 or 8 digits, digits only. Empty if not printed.' },
      sticker_date: { type: 'string', description: 'The date printed on the sticker, as YYYY-MM-DD (dates are Israeli day/month order, e.g. 23/08/2026 or 29-07-26).' },
      quantity: { type: 'integer', description: 'Quantity (כמות), default 1.' },
      document_number: { type: 'string', description: 'Order / delivery / invoice number if printed (הזמנה / תעודה), else empty.' },
    },
    required: ['supplier', 'sku', 'description', 'plate', 'sticker_date', 'quantity'],
  },
} as const;

/** null = reading unavailable (no key / API error) — the caller keeps the form manual. */
export async function readSticker(image: { base64: string; mediaType: string }): Promise<StickerFields | null> {
  const key = await apiKey();
  if (!key) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'report_sticker' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
            {
              type: 'text',
              text: 'This is a supplier sticker on a car part at an Israeli body shop (the photo may be rotated). Read it and report the fields. Leave a field empty if it is not printed — never guess.',
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error('[readSticker] API error', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return null;
  }
  const json = (await res.json()) as { content?: { type: string; input?: Record<string, unknown> }[] };
  const out = json.content?.find((c) => c.type === 'tool_use')?.input;
  if (!out) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const supplier = str(out.supplier);
  const date = str(out.sticker_date);
  return {
    supplier: supplier && (PART_RETURN_SUPPLIERS as readonly string[]).includes(supplier) ? supplier : null,
    supplier_other: str(out.supplier_other),
    sku: str(out.sku),
    description: str(out.description),
    plate: str(out.plate)?.replace(/\D/g, '') || null,
    sticker_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    quantity: typeof out.quantity === 'number' && out.quantity > 0 && out.quantity < 1000 ? Math.round(out.quantity) : null,
    document_number: str(out.document_number),
  };
}
