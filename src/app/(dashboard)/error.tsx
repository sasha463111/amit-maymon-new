'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { reportError } from '@/components/ErrorReporter';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard error boundary]', error);
    reportError('boundary', error, error.digest); // #43 → app_errors + auto BUG ticket
  }, [error]);

  return <ErrorState reset={reset} digest={error.digest} />;
}
