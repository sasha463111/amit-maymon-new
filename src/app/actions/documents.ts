'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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

  // Verify user has access to this case
  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, branch_id')
    .eq('id', caseId)
    .single();

  if (!caseRow) return { error: 'תיק לא נמצא' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('branch_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'פרופיל לא נמצא' };

  const userBranchId = (profile as { branch_id: string | null }).branch_id;
  const userRole = (profile as { role: string }).role;
  const caseBranchId = (caseRow as { branch_id: string }).branch_id;

  if (userRole !== 'CEO' && userBranchId !== caseBranchId) {
    return { error: 'אין גישה לתיק זה' };
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
    .select('branch_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'פרופיל לא נמצא' };
  
  const userBranchId = (profile as { branch_id: string | null }).branch_id;
  const userRole = (profile as { role: string }).role;
  const caseBranchId = (caseRow as { branch_id: string }).branch_id;

  // Check permissions: user uploaded it, or SERVICE_MANAGER/OFFICE/CEO in same branch
  const canDelete = 
    docRow.uploaded_by === user.id ||
    (userRole === 'CEO') ||
    (userBranchId === caseBranchId && (userRole === 'SERVICE_MANAGER' || userRole === 'OFFICE'));

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
