/** Modal that inline-previews a document (image/video/PDF), used by `DocumentsListPage` and `CaseDetailPage`. */
import { useEffect, useState } from 'react'
import { getDocumentDownloadUrl } from '../api/client'
import { Icon } from './icons'

const MUTED = '#8C7C5E'

// Callers (DocumentsListPage, CaseDetailPage) check this before rendering
// the modal -- anything else (Word docs, etc.) skips straight to download.
export function isPreviewable(mimeType: string) {
  return mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType === 'application/pdf'
}

/**
 * Full-screen overlay modal that fetches a signed download URL via
 * `getDocumentDownloadUrl()` and renders an image/video/iframe(PDF) preview
 * based on `mimeType`, plus a download link and close button.
 */
export default function DocumentPreviewModal({ documentId, fileName, mimeType, onClose }: { documentId: number; fileName: string; mimeType: string; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getDocumentDownloadUrl(documentId).then((r) => setUrl(r.url)).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load document.'))
  }, [documentId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={onClose}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: 'min(900px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 48px rgba(0,0,0,.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E7DCC6' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2118', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {url && <a href={url} target="_blank" rel="noreferrer" title="Download" style={{ display: 'flex' }}><Icon name="download" size={16} color="#6A5C42" /></a>}
            <span onClick={onClose} style={{ cursor: 'pointer', display: 'flex' }}><Icon name="x" size={16} color="#6A5C42" /></span>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: '#FBF7EE' }}>
          {error && <div style={{ color: '#B05C5C', fontSize: 13, padding: 24 }}>{error}</div>}
          {!error && !url && <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>}
          {!error && url && mimeType.startsWith('image/') && (
            <img src={url} alt={fileName} style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }} />
          )}
          {!error && url && mimeType.startsWith('video/') && (
            <video src={url} controls style={{ maxWidth: '100%', maxHeight: '80vh' }} />
          )}
          {!error && url && mimeType === 'application/pdf' && (
            <iframe src={url} title={fileName} style={{ width: '100%', height: '80vh', border: 'none' }} />
          )}
        </div>
      </div>
    </div>
  )
}
