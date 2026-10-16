import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { APP_ORIGIN } from '@/lib/customerDocLinks.server';

// 📧 Outlook in the app (16/10). Each employee connects their OWN Microsoft
// 365 mailbox (delegated OAuth 2.0 + PKCE, read-only: Mail.Read). The refresh
// token is stored encrypted (AES-256-GCM, key OUTLOOK_TOKEN_KEY — in the env,
// never in the DB). Dormant until the Entra app is registered and these are
// set in Vercel: OUTLOOK_TENANT_ID, OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET,
// OUTLOOK_TOKEN_KEY (separate from MS_* — those switch the app's own report
// mailbox to Graph app-only sending, see mailer.ts).

export const OUTLOOK_SCOPES = 'openid profile email offline_access User.Read Mail.Read';
export const OUTLOOK_REDIRECT = `${APP_ORIGIN}/api/outlook/callback`;

export function outlookConfigured(): boolean {
  return !!(process.env.OUTLOOK_TENANT_ID && process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET && tokenKey());
}

function tokenKey(): Buffer | null {
  const k = process.env.OUTLOOK_TOKEN_KEY;
  if (!k) return null;
  const b = Buffer.from(k, 'base64');
  return b.length === 32 ? b : null;
}

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ---------- token encryption ----------
function encrypt(plain: string): string {
  const key = tokenKey();
  if (!key) throw new Error('OUTLOOK_TOKEN_KEY missing');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}
function decrypt(blob: string): string {
  const key = tokenKey();
  if (!key) throw new Error('OUTLOOK_TOKEN_KEY missing');
  const [v, iv, tag, enc] = blob.split('.');
  if (v !== 'v1') throw new Error('unknown token format');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

// ---------- OAuth (authorization code + PKCE) ----------
export function newPkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, state: randomBytes(24).toString('base64url') };
}

export function authorizeUrl(state: string, challenge: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: OUTLOOK_REDIRECT,
    response_mode: 'query',
    scope: OUTLOOK_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  if (loginHint) p.set('login_hint', loginHint);
  return `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID}/oauth2/v2.0/authorize?${p}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.OUTLOOK_CLIENT_ID!, client_secret: process.env.OUTLOOK_CLIENT_SECRET!, scope: OUTLOOK_SCOPES, ...params }),
    cache: 'no-store',
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

/** After Microsoft's redirect: exchange the code, read who connected, store the encrypted refresh token. */
export async function completeConnection(userId: string, code: string, verifier: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: OUTLOOK_REDIRECT, code_verifier: verifier });
  if (!t.access_token || !t.refresh_token) return { ok: false, error: t.error_description?.slice(0, 200) || t.error || 'Microsoft לא החזיר הרשאה' };
  const me = (await (await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${t.access_token}` }, cache: 'no-store' })).json().catch(() => ({}))) as { displayName?: string; mail?: string; userPrincipalName?: string };
  const email = (me.mail || me.userPrincipalName || '').toLowerCase();
  // Only the company's own mailboxes.
  if (!email.endsWith('@toyota-tehila.co.il')) return { ok: false, error: `אפשר לחבר רק תיבה של toyota-tehila.co.il (התחברת עם ${email || 'חשבון אחר'})` };
  const d = db();
  if (!d) return { ok: false, error: 'שרת לא מוגדר' };
  const { error } = await d.from('ms_connections').upsert({ user_id: userId, ms_email: email, ms_name: me.displayName ?? null, refresh_token_enc: encrypt(t.refresh_token), scopes: t.scope ?? OUTLOOK_SCOPES, connected_at: new Date().toISOString(), last_used_at: new Date().toISOString() } as never);
  if (error) return { ok: false, error: error.message };
  accessCache.set(userId, { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 });
  return { ok: true, email };
}

const accessCache = new Map<string, { token: string; exp: number }>();

/** A valid access token for this user's mailbox (refreshes and rotates the stored refresh token). */
export async function accessTokenFor(userId: string): Promise<string | null> {
  const c = accessCache.get(userId);
  if (c && c.exp > Date.now() + 60_000) return c.token;
  const d = db();
  if (!d || !outlookConfigured()) return null;
  const { data } = await d.from('ms_connections').select('refresh_token_enc').eq('user_id', userId).maybeSingle();
  const row = data as { refresh_token_enc: string } | null;
  if (!row) return null;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(row.refresh_token_enc) });
  if (!t.access_token) {
    // Revoked / expired (password change, admin revoke): the user must reconnect.
    if (t.error === 'invalid_grant') await d.from('ms_connections').delete().eq('user_id', userId);
    return null;
  }
  const patch: Record<string, string> = { last_used_at: new Date().toISOString() };
  if (t.refresh_token) patch.refresh_token_enc = encrypt(t.refresh_token);
  await d.from('ms_connections').update(patch as never).eq('user_id', userId);
  accessCache.set(userId, { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 });
  return t.access_token;
}

export function forgetAccess(userId: string) {
  accessCache.delete(userId);
}

/** GET from Microsoft Graph as this user. */
export async function graphGet<T>(userId: string, path: string): Promise<{ ok: true; data: T } | { ok: false; error: string; reconnect?: boolean }> {
  const token = await accessTokenFor(userId);
  if (!token) return { ok: false, error: 'צריך לחבר מחדש את תיבת הדואר', reconnect: true };
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' }, cache: 'no-store' });
  if (res.status === 401) {
    forgetAccess(userId);
    return { ok: false, error: 'החיבור לתיבת הדואר פג — מתחברים מחדש', reconnect: true };
  }
  if (!res.ok) return { ok: false, error: `Microsoft: ${res.status}` };
  return { ok: true, data: (await res.json()) as T };
}
