// Demo site switch (2026-10-12). The demo is a separate Vercel project built
// from this same code, pointed at the garage-demo Supabase project, with
// NEXT_PUBLIC_DEMO_MODE=true. Production never sets it, so every value below
// is exactly the real one there. Not to be confused with NEXT_PUBLIC_PREVIEW_MODE
// (in-memory mock data, no database).
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** Business name shown in the header / logo fallback / page title. */
export const BRAND_NAME = DEMO_MODE ? 'מוסך הדגמה' : 'תהילה';

/** The CEO who approves estimates (named in UI and notification text). */
export const CEO_NAME = DEMO_MODE ? 'רונן' : 'עמית';

/** The office clerk who finishes case closure (named in UI text). */
export const CLOSURE_CLERK_NAME = DEMO_MODE ? 'אורית' : 'אילנה';

/** Staff accounts are recognised by their email domain. */
export const STAFF_EMAIL_DOMAIN = DEMO_MODE ? '@demo-garage.app' : '@toyota-tehila.co.il';

/** The single demo login, prefilled on the login page. */
export const DEMO_LOGIN_EMAIL = 'ceo@demo-garage.app';
