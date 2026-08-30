// One-time script: creates the two new referral-coordinator staff accounts
// (Ilanit, Avia). Run once, then delete this file (or leave it — it's
// idempotent-ish: re-running on an existing email just errors harmlessly).
//
// Usage (from the amit-maymon-new repo root):
//   node scripts/create_referral_users.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
// EMAIL_ONLY_LOGIN_PASSWORD from .env.local — same values the app itself
// uses, so these accounts log in exactly like every other staff email
// (email only, no password field, per src/app/actions/auth.ts).
//
// After this runs, the `profiles` row for each is auto-created by the
// existing DB trigger with a default role. Go to Settings → משתמשים →
// "ערוך" for each new row and set role = "משרד", same as any other new
// user — that part still needs a human click, same as it always has.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText.split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const password = env.EMAIL_ONLY_LOGIN_PASSWORD;

if (!url || !serviceKey || !password) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / EMAIL_ONLY_LOGIN_PASSWORD in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const NEW_USERS = [
  { email: 'ilanit@toyota-tehila.co.il', label: 'אילנית' },
  { email: 'avia@toyota-tehila.co.il', label: 'אביה' },
];

for (const u of NEW_USERS) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(`❌ ${u.label} (${u.email}): ${error.message}`);
  } else {
    console.log(`✅ ${u.label} (${u.email}) created — id: ${data.user.id}`);
  }
}

console.log('\nNow go to Settings → משתמשים in the app and set role="משרד" (+ branch, if wanted) for each of these two new rows.');
