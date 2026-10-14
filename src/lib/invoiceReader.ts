import 'server-only';
import { apiKey } from '@/lib/stickerReader';
import { PART_RETURN_SUPPLIERS } from '@/lib/partReturns';

// Reads a supplier invoice / delivery note / credit invoice photo with Claude
// (Amit, 2026-10-14: "like the sticker — photograph it and the fields fill
// themselves; what is not recognised is typed"). Same key as the sticker
// reader (Vault "anthropic_api_key"). No key → null and the form stays manual.

const MODEL = 'claude-haiku-5-5';

export type InvoiceFields = {
  doc_type: 'INVOICE' | 'DELIVERY_NOTE' | 'CREDIT_INVOICE' | null;
  supplier: string | null; // one of PART_RETURN_SUPPLIERS, or 'אחר'
  supplier_other: string | null;
  invoice_number: string | null;
  plate: string | null; // digits only
  amount: number | null; // total incl. VAT
  invoice_date: string | null; // YYYY-MM-DD
};

const SUPPLIERS = PART_RETURN_SUPPLIERS.filter((s) => s !== 'אחר');

const TOOL = {
  name: 'report_document',
  description: 'Report the fields read from an Israeli auto-parts supplier document (invoice, delivery note or credit invoice).',
  input_schema: {
    type: 'object',
    properties: {
      doc_type: {
        type: 'string',
        enum: ['INVOICE', 'DELIVERY_NOTE', 'CREDIT_INVOICE'],
        description: 'חשבונית / חשבונית מס = INVOICE; תעודת משלוח = DELIVERY_NOTE; חשבונית זיכוי / זיכוי = CREDIT_INVOICE.',
      },
      supplier: { type: 'string', enum: [...SUPPLIERS, 'אחר'], description: 'The supplier who issued the document. "יוניון מוטורס" / Union Motors = "טויוטה". If none matches, "אחר".' },
      supplier_other: { type: 'string', description: 'Supplier name as printed, only when supplier is "אחר".' },
      invoice_number: {
        type: 'string',
        description: 'The document number itself: "חשבונית מס' + "'" + '", "מספר חשבונית", "תעודת משלוח מס' + "'" + '", "זיכוי מס' + "'" + '". NOT the order number, NOT the customer number, NOT the allocation number (מספר הקצאה).',
      },
      plate: { type: 'string', description: 'Israeli vehicle licence plate if printed (רכב / רישוי / מס' + "'" + ' רכב), 7 or 8 digits, digits only. Empty if not printed.' },
      amount: { type: 'number', description: 'The total to pay INCLUDING VAT (סה"כ לתשלום / סה"כ כולל מע"מ). Positive number. Empty if not printed (e.g. a delivery note without prices).' },
      invoice_date: { type: 'string', description: 'The document date as YYYY-MM-DD (Israeli day/month order).' },
    },
    required: ['doc_type', 'supplier', 'invoice_number', 'invoice_date'],
  },
} as const;

/** null = reading unavailable (no key / API error) — the caller keeps the form manual. */
export async function readInvoice(image: { base64: string; mediaType: string }): Promise<InvoiceFields | null> {
  const key = await apiKey();
  if (!key) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'report_document' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
            {
              type: 'text',
              text: 'This is a photo of a supplier document at an Israeli body shop (invoice, delivery note or credit invoice; the photo may be rotated). Read it and report the fields. Leave a field empty if it is not printed or not legible — never guess.',
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error('[readInvoice] API error', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return null;
  }
  const json = (await res.json()) as { content?: { type: string; input?: Record<string, unknown> }[] };
  const out = json.content?.find((c) => c.type === 'tool_use')?.input;
  if (!out) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const supplier = str(out.supplier);
  const date = str(out.invoice_date);
  const type = str(out.doc_type);
  const amount = typeof out.amount === 'number' && out.amount > 0 && out.amount < 10_000_000 ? Math.round(out.amount * 100) / 100 : null;
  return {
    doc_type: type === 'INVOICE' || type === 'DELIVERY_NOTE' || type === 'CREDIT_INVOICE' ? type : null,
    supplier: supplier && (PART_RETURN_SUPPLIERS as readonly string[]).includes(supplier) ? supplier : null,
    supplier_other: str(out.supplier_other),
    invoice_number: str(out.invoice_number),
    plate: str(out.plate)?.replace(/\D/g, '') || null,
    amount,
    invoice_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
  };
}
