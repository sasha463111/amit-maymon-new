import { BRAND_NAME } from '@/lib/demo';

// The brand mark (16/10): drawn as text. public/logo.png is white letters in
// the middle of a big transparent square — at header / login size the word
// came out tiny, and on the white customer pages (/t, /d, /l) invisible.

type LogoVariant = 'header' | 'login';

const variantClasses: Record<LogoVariant, string> = {
  header: 'bg-brand-red rounded-lg px-2.5 py-1 font-black text-xl text-white tracking-tight',
  login: 'bg-brand-red rounded-xl px-5 py-2 font-black text-3xl text-white tracking-tight',
};

export function Logo({ variant = 'header' }: { variant?: LogoVariant }) {
  return <span className={`inline-flex items-center justify-center leading-tight ${variantClasses[variant]}`}>{BRAND_NAME}</span>;
}
