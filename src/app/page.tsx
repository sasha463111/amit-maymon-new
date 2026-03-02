import { redirect } from 'next/navigation';

const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

export default function HomePage() {
  if (isPreview) redirect('/cases');
  redirect('/login');
}
