'use server';

import { createClient } from '@/lib/supabase/server';
import { firstName, whatsAppUrl } from '@/lib/customerDocs';
import { APP_ORIGIN, newToken, hashToken, serviceClient } from '@/lib/customerDocLinks.server';
import { TRACK_LINK_DAYS, TRACK_LINK_ROLES } from '@/lib/caseTrack';

// "📲 קישור מעקב ללקוח" on a case (16/10, design round): a personal link where
// the customer sees which stage the car is in, instead of calling to ask. A new
// link replaces the previous one; only the token's hash is stored.

export async function createCaseTrackLink(caseId: string): Promise<{ error: string } | { error: null; url: string; message: string; whatsapp: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!TRACK_LINK_ROLES.includes((prof as { role: string } | null)?.role ?? '')) return { error: 'אין הרשאה' };
  // RLS: the case must be one this user may see.
  const { data: c } = await supabase.from('cases').select('id, customer_name, phone, closed_at, deleted_at, cars(license_plate)').eq('id', caseId).maybeSingle();
  const row = c as { id: string; customer_name: string | null; phone: string | null; closed_at: string | null; deleted_at: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null } | null;
  if (!row || row.deleted_at) return { error: 'התיק לא נמצא' };
  const db = serviceClient();
  if (!db) return { error: 'שגיאת שרת' };
  const token = newToken();
  const expires = new Date(Date.now() + TRACK_LINK_DAYS * 86_400_000).toISOString();
  const { error } = await db.from('cases').update({ track_token_hash: hashToken(token), track_expires_at: expires } as never).eq('id', row.id);
  if (error) return { error: error.message };
  const url = `${APP_ORIGIN}/t/${token}`;
  const plate = (Array.isArray(row.cars) ? row.cars[0] : row.cars)?.license_plate ?? null;
  const first = firstName(row.customer_name);
  const message = [
    `${first ? `שלום ${first}` : 'שלום'}, כאן מרכז שירות תהילה.`,
    `בקישור הזה אפשר לראות בכל רגע באיזה שלב נמצא הרכב${plate ? ` (${plate})` : ''} בתיקון:`,
    url,
    'הקישור אישי. לכל שאלה אנחנו כאן.',
  ].join('\n');
  return { error: null, url, message, whatsapp: whatsAppUrl(row.phone, message) };
}
