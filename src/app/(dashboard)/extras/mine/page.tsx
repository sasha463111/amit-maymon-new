import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';

const STATUS_LABELS: Record<string, string> = {
  IN_TREATMENT: 'בטיפול',
  REJECTED: 'נדחתה',
  DONE: 'בוצעה',
};
const STATUS_COLORS: Record<string, string> = {
  IN_TREATMENT: 'bg-amber-100 text-amber-800 border-amber-300',
  REJECTED: 'bg-red-100 text-red-700 border-red-300',
  DONE: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

export default async function ExtrasMinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { role: string } | null;
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';
  if (!isPreview && profile?.role !== 'PAINTER') {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">התוספות שלי</h1>
        <p className="text-gray-500">אין גישה לדף זה.</p>
      </div>
    );
  }

  const { data: extras } = await supabase
    .from('bodywork_extras')
    .select(`
      id,
      description,
      status,
      created_at,
      image_path,
      case_id,
      cases(case_key, customer_name, cars(license_plate))
    `)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  const rawList = (extras ?? []).map((r) => {
    const row = r as {
      id: string;
      description: string;
      status: string;
      created_at: string;
      image_path: string;
      case_id: string;
      cases: { case_key: string | null; customer_name: string | null; cars: { license_plate: string | null } | null } | null;
    };
    const c = Array.isArray(row.cases) ? row.cases[0] : row.cases;
    const car = c && (Array.isArray(c.cars) ? c.cars[0] : c.cars);
    return {
      id: row.id,
      description: row.description,
      status: row.status,
      created_at: row.created_at,
      image_path: row.image_path,
      case_id: row.case_id,
      case_key: c?.case_key ?? null,
      customer_name: c?.customer_name ?? null,
      plate: car?.license_plate ?? '—',
    };
  });

  // Batch-sign all image URLs
  const paths = rawList.map((e) => e.image_path).filter(Boolean);
  let signedImageUrls: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('extras-images')
      .createSignedUrls(paths, 3600);
    for (const e of (signed ?? []) as Array<{ path: string; signedUrl: string; error: string | null }>) {
      if (e.signedUrl && !e.error) signedImageUrls[e.path] = e.signedUrl;
    }
  }
  const list = rawList.map((e) => ({ ...e, image_url: signedImageUrls[e.image_path] ?? null }));

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">התוספות שלי</h1>
        <Link
          href="/extras/new"
          className="bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 rounded-lg text-sm font-semibold"
        >
          + תוספת חדשה
        </Link>
      </div>
      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <div className="text-5xl mb-3">🎨</div>
          <p className="text-sm">עוד לא הגשת תוספות</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((e) => (
            <article
              key={e.id}
              className={`bg-white rounded-xl border-2 shadow-sm overflow-hidden flex flex-col ${
                e.status === 'IN_TREATMENT' ? 'border-amber-200' :
                e.status === 'REJECTED' ? 'border-red-200' : 'border-emerald-200'
              }`}
            >
              {e.image_url ? (
                <a
                  href={e.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-video bg-gray-100 border-b border-gray-200 overflow-hidden"
                >
                  <img
                    src={e.image_url}
                    alt={e.description.slice(0, 40)}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </a>
              ) : (
                <div className="aspect-video bg-gray-50 border-b border-gray-200 flex items-center justify-center text-gray-300">
                  <span className="text-4xl">🖼️</span>
                </div>
              )}
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">
                      {e.customer_name ?? e.case_key ?? e.plate}
                    </p>
                    {e.plate !== '—' && (
                      <div className="mt-0.5"><LicensePlate plate={e.plate} size="sm" /></div>
                    )}
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[e.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_LABELS[e.status] ?? e.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words flex-1">
                  {e.description}
                </p>
                <p className="text-[10px] text-gray-400 mt-2">
                  {new Date(e.created_at).toLocaleString('he-IL')}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
