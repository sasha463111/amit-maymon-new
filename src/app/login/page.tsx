'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction } from '@/app/actions/auth';
import { Logo } from '@/components/Logo';

const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // In PREVIEW mode, check if we should show login page
  useEffect(() => {
    // Check if user wants to see login (from logout or direct navigation)
    const showLogin = sessionStorage.getItem('preview_show_login') ||
                     document.cookie.includes('preview_show_login=true');

    if (isPreview && !showLogin) {
      // Auto-redirect to cases if not explicitly showing login
      const timer = setTimeout(() => {
        router.replace('/cases');
      }, 2000);
      return () => clearTimeout(timer);
    } else if (isPreview && showLogin) {
      // Clear the flag after showing
      sessionStorage.removeItem('preview_show_login');
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isPreview) {
      // In PREVIEW mode, just redirect to cases
      setLoading(false);
      sessionStorage.removeItem('preview_show_login');
      router.push('/cases');
      return;
    }

    try {
      const result = await loginAction({ email, rememberMe });
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
    } catch (err: unknown) {
      const isRedirect = err && typeof err === 'object' && (err as { digest?: string }).digest === 'NEXT_REDIRECT';
      if (!isRedirect) setError('שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Logo variant="login" />
          </div>
          <p className="text-sm text-gray-500 mt-3">מערכת ניהול תיקים</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-7">
          {isPreview && (
            <div className="mb-5 text-sm text-amber-700 bg-amber-50 px-3 py-2.5 rounded-lg border border-amber-200">
              מצב תצוגה מקדימה — תועבר אוטומטית בעוד רגע.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                אימייל
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 outline-none transition-all bg-gray-50 focus:bg-white"
                dir="ltr"
                autoComplete="email"
                placeholder="name@example.com"
              />
            </div>

            <p className="text-xs text-gray-500 -mt-1 leading-relaxed">
              הכניסה היא עם כתובת המייל בלבד, ללא סיסמה.
            </p>

            {!isPreview && (
              <label className="flex items-center gap-2.5 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 text-brand-red focus:ring-brand-red w-4 h-4"
                />
                זכור אותי (30 יום)
              </label>
            )}

            {error && (
              <div className="text-sm text-red-700 bg-red-50 px-3 py-2.5 rounded-lg border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-red hover:bg-brand-red-dark active:bg-brand-red-dark text-white py-2.5 rounded-lg font-medium disabled:opacity-50 transition-colors shadow-sm mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  מתחבר...
                </span>
              ) : isPreview ? 'המשך לתצוגה מקדימה' : 'התחבר'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
