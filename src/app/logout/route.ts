import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

export async function GET(request: Request) {
  const url = new URL(request.url);
  
  if (isPreview) {
    // In PREVIEW mode, just redirect to login (no actual logout needed)
    // Set flag to show login page
    const response = NextResponse.redirect(new URL('/login', url.origin));
    // Set a cookie or header to indicate we want to show login
    response.cookies.set('preview_show_login', 'true', { maxAge: 60 });
    return response;
  }
  
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Clear the CEO "view as" cookie on logout so the next session doesn't
  // accidentally land in someone else's UI.
  const response = NextResponse.redirect(new URL('/login', url.origin));
  response.cookies.delete('tehila_view_as');
  return response;
}
