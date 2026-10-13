import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// One way out for every email the app sends (2026-10-13, Tomer: option B).
//
// Microsoft 365 (Graph sendMail) from the real mailbox Report@toyota-tehila.co.il
// when MS_TENANT_ID + MS_CLIENT_ID + MS_CLIENT_SECRET are set in Vercel — the
// mail is sent BY the mailbox and lands in its Sent Items. The Entra app has
// Mail.Send restricted to that one mailbox (ApplicationAccessPolicy).
// Until those are set, everything keeps going through Resend exactly as before,
// so shipping this changes nothing; adding the env vars switches over.
//
// onceKey: an email that must go out at most once (the daily report — the cron
// runs every 30 min). Resend honours it as Idempotency-Key; for Graph the key
// is claimed in public.sent_emails before sending and released on failure.

const SENDER = process.env.MAIL_SENDER || 'Report@toyota-tehila.co.il';
const DISPLAY_NAME = 'תהילה ניהול מוסך';
const RESEND_FROM = `${DISPLAY_NAME} <reports@toyota-tehila.co.il>`;

export type MailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  onceKey?: string;
};
export type MailResult =
  | { ok: true; status: 'sent' | 'duplicate'; via: 'graph' | 'resend' }
  | { ok: false; error: string; via: 'graph' | 'resend' };

function graphConfigured(): boolean {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

/** Which transport is live — for diagnostics only (no secrets). */
export function mailTransport(): 'graph' | 'resend' {
  return graphConfigured() ? 'graph' : 'resend';
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  return graphConfigured() ? sendViaGraph(input) : sendViaResend(input);
}

// ---------- Microsoft Graph ----------

let cachedToken: { value: string; expiresAt: number } | null = null;

async function graphToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    client_secret: process.env.MS_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Microsoft login failed: ${res.status} ${(json.error_description ?? '').slice(0, 200)}`);
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sendViaGraph(input: MailInput): Promise<MailResult> {
  const db = input.onceKey ? serviceDb() : null;
  if (input.onceKey) {
    if (!db) return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing (needed for onceKey)', via: 'graph' };
    const { data, error } = await db.from('sent_emails').upsert({ key: input.onceKey }, { onConflict: 'key', ignoreDuplicates: true }).select('key');
    if (error) return { ok: false, error: `sent_emails: ${error.message}`, via: 'graph' };
    if (!data?.length) return { ok: true, status: 'duplicate', via: 'graph' };
  }
  const release = async () => {
    if (db && input.onceKey) await db.from('sent_emails').delete().eq('key', input.onceKey);
  };

  try {
    const token = await graphToken();
    const addr = (list?: string[]) => (list ?? []).filter(Boolean).map((a) => ({ emailAddress: { address: a } }));
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: 'HTML', content: input.html },
          toRecipients: addr(input.to),
          ccRecipients: addr(input.cc),
          bccRecipients: addr(input.bcc),
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    });
    if (res.status !== 202) {
      const text = await res.text().catch(() => '');
      await release();
      return { ok: false, error: `${res.status} ${text.slice(0, 300)}`, via: 'graph' };
    }
    return { ok: true, status: 'sent', via: 'graph' };
  } catch (e) {
    await release();
    return { ok: false, error: e instanceof Error ? e.message : String(e), via: 'graph' };
  }
}

// ---------- Resend (until Microsoft 365 is configured) ----------

async function sendViaResend(input: MailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing', via: 'resend' };
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json; charset=utf-8' };
  if (input.onceKey) headers['Idempotency-Key'] = input.onceKey;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: RESEND_FROM,
      to: input.to,
      cc: input.cc?.length ? input.cc : undefined,
      bcc: input.bcc?.length ? input.bcc : undefined,
      subject: input.subject,
      html: input.html,
    }),
  });
  // Same key again: Resend replays the first answer or refuses with 409 — either way nothing new is sent.
  if (res.status === 409) return { ok: true, status: 'duplicate', via: 'resend' };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${text.slice(0, 300)}`, via: 'resend' };
  }
  return { ok: true, status: 'sent', via: 'resend' };
}
