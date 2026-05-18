'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { stopViewAsUser } from '@/app/actions/users';

export function StopViewAsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await stopViewAsUser();
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="px-3 py-1 bg-white border border-purple-300 rounded text-xs font-semibold hover:bg-purple-50 transition-colors disabled:opacity-50"
    >
      {pending ? '...' : '✕ חזור לתצוגת CEO'}
    </button>
  );
}
