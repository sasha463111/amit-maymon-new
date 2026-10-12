'use client';

import { useState } from 'react';
import { BRAND_NAME, DEMO_MODE } from '@/lib/demo';

type LogoVariant = 'header' | 'login';

const variantClasses: Record<LogoVariant, { wrapper: string; text: string; imgSize: string }> = {
  header: {
    wrapper: 'bg-brand-red rounded px-2.5 py-1',
    text: 'font-black text-xl text-white tracking-tight',
    imgSize: 'h-7 w-auto max-w-[90px]',
  },
  login: {
    wrapper: 'bg-brand-red rounded-xl px-5 py-2',
    text: 'font-black text-3xl text-white tracking-tight',
    imgSize: 'h-11 w-auto max-w-[140px]',
  },
};

export function Logo({ variant = 'header' }: { variant?: LogoVariant }) {
  // Demo site: never show the real business logo image.
  const [useTextFallback, setUseTextFallback] = useState(DEMO_MODE);
  const { wrapper, text, imgSize } = variantClasses[variant];

  if (useTextFallback) {
    return (
      <div className={`${wrapper} inline-flex items-center justify-center`}>
        <span className={text}>{BRAND_NAME}</span>
      </div>
    );
  }

  return (
    <div className={`${wrapper} inline-flex items-center justify-center overflow-hidden`}>
      <img
        src="/logo.png"
        alt={BRAND_NAME}
        className={`object-contain ${imgSize}`}
        onError={() => setUseTextFallback(true)}
      />
    </div>
  );
}
