/**
 * Extracted from CaseDetailClientV2.tsx (safe first step of the god-component
 * refactor). Upload/delete logic (state + the actual server-action calls)
 * stays owned by the parent — this component only renders the grid and calls
 * back up via onUploadFiles/onDeleteDocument, so behavior is unchanged from
 * before the extraction.
 */
export interface CaseDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  document_type?: string | null;
  created_at: string;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  ESTIMATE: 'אומדן',
  FINAL_ESTIMATE: 'אומדן סופי',
  WHEELS_CHECK: 'טפסי גלגלים',
};

export function DocumentsSection({
  documents,
  signedDocUrls,
  canEdit,
  documentError,
  uploadingDocument,
  onUploadFiles,
  onDeleteDocument,
}: {
  documents: CaseDocument[];
  signedDocUrls: Record<string, string>;
  canEdit: boolean;
  documentError: string | null;
  uploadingDocument: boolean;
  onUploadFiles: (files: File[]) => Promise<void>;
  onDeleteDocument: (docId: string) => Promise<void>;
}) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-3 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="text-2xl">📎</span>
          מסמכים וקבצים
        </h2>
        {canEdit && (
          <div className="flex gap-2">
            <label className={`flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors ${uploadingDocument ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  await onUploadFiles(Array.from(files));
                  e.target.value = '';
                }}
                disabled={uploadingDocument}
              />
              📁 {uploadingDocument ? 'מעלה...' : 'בחר קבצים'}
            </label>
            <label className={`flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors ${uploadingDocument ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  await onUploadFiles(Array.from(files));
                  e.target.value = '';
                }}
                disabled={uploadingDocument}
              />
              📷 {uploadingDocument ? 'מעלה...' : 'צלם'}
            </label>
          </div>
        )}
      </div>
      {documentError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          ⚠️ {documentError}
        </div>
      )}
      {documents.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm">אין קבצים להצגה</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {documents.map((doc) => {
            const url = signedDocUrls[doc.file_path];
            const fileSize = doc.file_size ? (doc.file_size / 1024).toFixed(1) + ' KB' : '—';
            const isImage = doc.mime_type?.startsWith('image/');
            const isPdf = doc.mime_type === 'application/pdf';
            const docType = doc.document_type ?? null;
            const isFinalEstimate = docType === 'FINAL_ESTIMATE';
            return (
              <div
                key={doc.id}
                className={`group relative flex flex-col rounded-lg border overflow-hidden transition-all ${
                  isFinalEstimate
                    ? 'bg-purple-50 border-purple-300'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                {/* Preview area */}
                <a
                  href={url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square bg-white border-b border-gray-200 overflow-hidden relative"
                  onClick={(e) => { if (!url) e.preventDefault(); }}
                >
                  {isImage && url ? (
                    <img
                      src={url}
                      alt={doc.file_name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : isPdf ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                      <span className="text-4xl">📄</span>
                      <span className="text-[10px] font-semibold mt-1">PDF</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                      <span className="text-4xl">{isFinalEstimate ? '⭐' : '📎'}</span>
                    </div>
                  )}
                  {/* Hover overlay with "view" */}
                  {url && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <span className="text-white text-xs font-semibold">פתח</span>
                    </div>
                  )}
                </a>
                {/* Caption */}
                <div className="p-2 flex-1 flex flex-col gap-1">
                  <p className="text-xs font-medium text-gray-800 truncate" title={doc.file_name}>
                    {doc.file_name}
                  </p>
                  {docType && (
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold self-start ${
                      isFinalEstimate ? 'bg-purple-200 text-purple-900' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {DOC_TYPE_LABEL[docType] ?? docType}
                    </span>
                  )}
                  <p className="text-[10px] text-gray-400">{fileSize} · {new Date(doc.created_at).toLocaleDateString('he-IL')}</p>
                </div>
                {/* Delete (top-right corner, hover-revealed on touchscreens stays visible) */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void onDeleteDocument(doc.id)}
                    className="absolute top-1 left-1 w-6 h-6 rounded-full bg-white/90 text-red-600 text-xs shadow-md hover:bg-red-50"
                    aria-label="מחק קובץ"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
