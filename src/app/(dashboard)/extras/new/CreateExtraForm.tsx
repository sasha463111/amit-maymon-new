'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createExtra } from '@/app/actions/extras';

interface CaseOption {
  id: string;
  label: string;
}

export function CreateExtraForm({ cases }: { cases: CaseOption[] }) {
  const router = useRouter();
  const [caseId, setCaseId] = useState(cases[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('נא להעלות תמונה');
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${caseId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('extras-images')
      .upload(path, file, { upsert: false });

    if (uploadErr) {
      setError(uploadErr.message);
      setLoading(false);
      return;
    }

    const res = await createExtra({
      case_id: caseId,
      description: description.trim(),
      image_path: path,
    });
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setDescription('');
    setFile(null);
    router.push('/extras/mine');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">תיק *</label>
        <select
          required
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        >
          <option value="">בחר תיק</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">תיאור *</label>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
          rows={3}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">תמונה *</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium cursor-pointer hover:bg-gray-50">
            📁 בחר תמונה
            <input
              type="file"
              accept="image/*"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-300 text-blue-700 rounded-md text-sm font-medium cursor-pointer hover:bg-blue-100">
            📷 צלם במצלמה
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        </div>
        {file && (
          <p className="mt-2 text-xs text-green-700">✓ {file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
      >
        {loading ? 'שולח...' : 'צור תוספת'}
      </button>
    </form>
  );
}
