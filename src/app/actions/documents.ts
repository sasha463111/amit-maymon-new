'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';

/**
 * Batch-create signed URLs for storage objects. Used by the case detail page,
 * approvals screen, painters page, and extras page to display private-bucket
 * images and PDFs without needing per-image client round-trips.
 *
 * Returns a Map keyed by `path` so the caller can look up the URL by path.
 * Skips paths the user can't access (the storage RLS layer enforces that —
 * if a signed-URL call returns 403, we just omit the entry).
 */
export async function getSignedFileUrls(
  bucket: 'case-documents' | 'painter-images' | 'extras-images' | 'referral-documents',
  paths: string[],
  expiresInSec = 3600
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresInSec);
  const out: Record<string, string> = {};
  for (const entry of (data ?? []) as Array<{ path: string; signedUrl: string; error: string | null }>) {
    if (entry.signedUrl && !entry.error) out[entry.path] = entry.signedUrl;
  }
  return out;
}

export async function uploadCaseDocument(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const caseId = formData.get('case_id') as string;
  const file = formData.get('file') as File;
  const documentType = (formData.get('document_type') as string | null) ?? null;

  if (!caseId || !file) {
    return { error: 'חסרים פרטים (case_id או file)' };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'הקובץ ריק או לא תקין' };
  }

  // Validate size (20 MB max — generous for high-res iPhone photos but
  // prevents accidental huge uploads).
  const MAX_BYTES = 20 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return { error: `הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)} MB). מקסימום 20 MB.` };
  }

  // Validate MIME — accept any image type, PDFs, and common doc formats.
  const ACCEPTED = /^(image\/|application\/(pdf|x-pdf|msword|vnd\.openxmlformats|vnd\.ms-excel))/i;
  if (file.type && !ACCEPTED.test(file.type)) {
    return { error: `סוג קובץ לא נתמך: ${file.type}. תמונות + PDF בלבד.` };
  }

  // Verify user has access to this case
  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, branch_id')
    .eq('id', caseId)
    .single();

  if (!caseRow) return { error: 'תיק לא נמצא' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('branch_ids, role, sees_all_branches')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'פרופיל לא נמצא' };

  const userBranchIds = (profile as { branch_ids: string[] }).branch_ids;
  const userRole = (profile as { role: string }).role;
  const userSeesAll = (profile as { sees_all_branches?: boolean }).sees_all_branches === true;
  const caseBranchId = (caseRow as { branch_id: string }).branch_id;

  // CEO and cross-branch (sees_all_branches) staff may act on any branch's case.
  // For multi-branch staff, check if the case's branch is in their branch_ids array
  if (userRole !== 'CEO' && !userSeesAll && !userBranchIds.includes(caseBranchId)) {
    return { error: 'אין גישה לתיק זה' };
  }

  // Branch access alone is not enough — whether this ROLE may upload at all is
  // governed by Settings > Permissions (role_permissions.upload_documents).
  if (!(await hasPermission(supabase, 'upload_documents'))) {
    return { error: 'אין הרשאה להעלות מסמכים' };
  }

  // Upload file to storage. Path is namespaced by caseId so RLS can scope by prefix.
  const safeName = file.name.replace(/[^\w.\-א-ת ]/g, '_');
  const path = `${caseId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('case-documents')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (uploadError) {
    console.error('[uploadCaseDocument] storage upload failed', {
      caseId,
      file: { name: file.name, size: file.size, type: file.type },
      message: uploadError.message,
    });
    return { error: `שגיאה בהעלאת הקובץ ל-Storage: ${uploadError.message}` };
  }

  // Insert document record
  const { error: insertError } = await supabase
    .from('case_documents')
    .insert({
      case_id: caseId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: user.id,
      ...(documentType ? { document_type: documentType } : {}),
    } as never);

  if (insertError) {
    console.error('[uploadCaseDocument] insert row failed', {
      caseId,
      path,
      message: insertError.message,
    });
    // Try to delete uploaded file if insert failed
    await supabase.storage.from('case-documents').remove([path]);
    return { error: `שגיאה בשמירת פרטי הקובץ: ${insertError.message}` };
  }

  // Write audit event
  await supabase.from('audit_events').insert({
    entity_type: 'CASE',
    entity_id: caseId,
    action: 'DOCUMENT_UPLOADED',
    user_id: user.id,
    payload: { file_name: file.name, file_size: file.size, document_type: documentType },
  } as never);

  revalidatePath(`/cases/${caseId}`);
  return { ok: true, error: null, document_type: documentType };
}

export async function deleteCaseDocument(documentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  // Get document info
  const { data: doc } = await supabase
    .from('case_documents')
    .select('id, case_id, file_path, uploaded_by')
    .eq('id', documentId)
    .single();

  if (!doc) return { error: 'קובץ לא נמצא' };

  const docRow = doc as { case_id: string; file_path: string; uploaded_by: string | null };
  
  // Verify user has access
  const { data: caseRow } = await supabase
    .from('cases')
    .select('branch_id')
    .eq('id', docRow.case_id)
    .single();

  if (!caseRow) return { error: 'תיק לא נמצא' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('branch_ids, role, sees_all_branches')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'פרופיל לא נמצא' };

  const userBranchIds = (profile as { branch_ids: string[] }).branch_ids;
  const userRole = (profile as { role: string }).role;
  const caseBranchId = (caseRow as { branch_id: string }).branch_id;

  // You may always remove a file you uploaded yourself — that is not a
  // delegated permission and stays outside the matrix.
  const isOwnUpload = docRow.uploaded_by === user.id;

  // Deleting SOMEONE ELSE'S file needs both reach (CEO / cross-branch / the
  // case is in one of your branches) AND the delete_documents permission from
  // Settings > Permissions. Defaults to SERVICE_MANAGER / OFFICE / CEO.
  const canReachCase =
    userRole === 'CEO' ||
    (profile as { sees_all_branches?: boolean }).sees_all_branches === true ||
    userBranchIds.includes(caseBranchId);

  const canDelete =
    isOwnUpload || (canReachCase && (await hasPermission(supabase, 'delete_documents')));

  if (!canDelete) {
    return { error: 'אין הרשאה למחוק קובץ זה' };
  }

  // Delete from storage
  await supabase.storage.from('case-documents').remove([docRow.file_path]);

  // Delete record
  const { error } = await supabase
    .from('case_documents')
    .delete()
    .eq('id', documentId);

  if (error) return { error: `שגיאה במחיקת הקובץ: ${error.message}` };

  // Write audit event
  await supabase.from('audit_events').insert({
    entity_type: 'CASE',
    entity_id: docRow.case_id,
    action: 'DOCUMENT_DELETED',
    user_id: user.id,
    payload: { document_id: documentId },
  } as never);

  revalidatePath(`/cases/${docRow.case_id}`);
  return { ok: true, error: null };
}

/**
 * Rotate a stored document 90° clockwise, in place.
 *
 * Why this exists: scanners sometimes write a page upside-down or on its side
 * with no rotation metadata, so the file genuinely IS wrong — the viewer is
 * showing it faithfully. Chrome's own rotate button doesn't persist, so the
 * next person to open it sees it sideways again. This rewrites the file, so it
 * is fixed once for everyone.
 *
 * Each call advances 90°, so four clicks return to the original. That is
 * deliberate: it handles upside-down (two clicks) and both sideways cases with
 * the same single control, and needs no orientation picker.
 *
 * Automatic detection was considered and rejected — these scans contain no text
 * layer and no scanner signature, so deciding "this is upside-down" would need
 * OCR, and a wrong guess would silently corrupt a document that was fine.
 */
export async function rotateDocument(
  kind: 'case' | 'referral',
  documentId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const table = kind === 'case' ? 'case_documents' : 'referral_documents';
  const bucket = kind === 'case' ? 'case-documents' : 'referral-documents';

  // Rotating is a correction to an existing document, so it is gated on the
  // same permission as putting the document there in the first place.
  const permission = kind === 'case' ? 'upload_documents' : 'create_referral';
  if (!(await hasPermission(supabase, permission))) {
    return { error: 'אין הרשאה לערוך מסמך זה' };
  }

  const { data: docData } = await supabase
    .from(table)
    .select(kind === 'case' ? 'id, case_id, file_path, mime_type' : 'id, referral_id, file_path, mime_type')
    .eq('id', documentId)
    .single();

  const doc = docData as { file_path: string; mime_type: string | null; case_id?: string; referral_id?: string } | null;
  if (!doc) return { error: 'הקובץ לא נמצא' };

  // RLS on the bucket decides whether this user may read/write the object;
  // a failure here means they cannot reach this document's branch.
  const { data: blob, error: dlError } = await supabase.storage.from(bucket).download(doc.file_path);
  if (dlError || !blob) return { error: 'שגיאה בטעינת הקובץ' };

  const input = Buffer.from(await blob.arrayBuffer());
  const mime = doc.mime_type ?? '';
  let output: Buffer;

  try {
    if (mime === 'application/pdf') {
      const { PDFDocument, degrees } = await import('pdf-lib');
      const pdf = await PDFDocument.load(input);
      for (const page of pdf.getPages()) {
        // Add to the existing angle rather than setting it, so repeated
        // clicks keep advancing instead of snapping back to 90.
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + 90) % 360));
      }
      output = Buffer.from(await pdf.save());
    } else if (mime.startsWith('image/')) {
      const sharp = (await import('sharp')).default;
      // rotate(90) bakes the pixels, so the result is correct everywhere —
      // including for anyone who downloads the file.
      output = await sharp(input).rotate(90).toBuffer();
    } else {
      return { error: 'ניתן לסובב קבצי PDF ותמונות בלבד' };
    }
  } catch {
    return { error: 'שגיאה בסיבוב הקובץ' };
  }

  // Overwrite the same path so every existing link keeps working.
  const { error: upError } = await supabase.storage
    .from(bucket)
    .upload(doc.file_path, output, { upsert: true, contentType: mime || undefined });
  if (upError) return { error: `שגיאה בשמירת הקובץ: ${upError.message}` };

  if (kind === 'case' && doc.case_id) {
    revalidatePath(`/cases/${doc.case_id}`);
  } else if (doc.referral_id) {
    revalidatePath(`/referrals/${doc.referral_id}`);
  }
  return { ok: true };
}
