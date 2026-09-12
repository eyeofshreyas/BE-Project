/** `/documents/:documentId` route: inline preview of one document (image, video or PDF).
 * There's no single-document GET endpoint, so the file's name and type come from
 * `listDocuments()`, the same way `CaseDetailPage` finds its case in `listCases()`.
 * The file itself is fetched as a signed URL via `getDocumentDownloadUrl()`. */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listDocuments, getDocumentDownloadUrl } from '../../api/client'
import type { DocumentSummary } from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate } from '../../utils/date'
import { isPreviewable, formatSize } from '../../utils/files'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#6E6759'

export default function DocumentPreviewPage() {
  const { documentId } = useParams()
  const navigate = useNavigate()
  const numericId = Number(documentId)

  const [doc, setDoc] = useState<DocumentSummary | null>(null)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!numericId) { setError('Invalid document.'); setLoading(false); return }
    // the signed URL and the metadata are independent, so ask for both at once
    Promise.all([listDocuments(), getDocumentDownloadUrl(numericId)])
      .then(([rows, signed]) => {
        const found = rows.find((d) => d.id === numericId)
        if (!found) { setError("This document doesn't exist or you don't have access to it."); return }
        setDoc(found)
        setUrl(signed.url)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this document.'))
      .finally(() => setLoading(false))
  }, [numericId])

  if (loading) return <div className={styles.page}><div className={styles.wrap}><div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading document…</div></div></div>
  if (error || !doc) return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>
        <div className={styles.ghostChip} style={{ width: 'fit-content' }} onClick={() => navigate('/documents')}>Back to documents</div>
      </div>
    </div>
  )

  const meta = [doc.document_type, doc.case_number, formatSize(doc.file_size), `Uploaded ${formatDate(doc.upload_date)}`]
    .filter(Boolean).join(' · ')

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.breadcrumb}>
          {/* back to wherever the file was opened from -- the case, the matter, or the library */}
          <span style={{ cursor: 'pointer' }} onClick={() => navigate(-1)}>Back</span>
          <span>&rsaquo;</span>
          <span>{doc.file_name}</span>
        </div>

        <div className={styles.header}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="file-text" size={21} color="#23306B" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className={styles.title} style={{ fontSize: 20, overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</div>
              <div className={styles.subtitle}>{meta}</div>
            </div>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className={styles.ghostChip} style={{ textDecoration: 'none', flexShrink: 0 }}>
              <Icon name="download" size={15} color={MUTED} /> Download
            </a>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: '#F6F2E9', border: '1px solid #CFC6B0', borderRadius: 3, minHeight: 320 }}>
          {doc.mime_type.startsWith('image/') && <img src={url} alt={doc.file_name} style={{ maxWidth: '100%', display: 'block' }} />}
          {doc.mime_type.startsWith('video/') && <video src={url} controls style={{ maxWidth: '100%', maxHeight: '78vh' }} />}
          {doc.mime_type === 'application/pdf' && <iframe src={url} title={doc.file_name} style={{ width: '100%', height: '78vh', border: 'none' }} />}
          {!isPreviewable(doc.mime_type) && (
            <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13.5 }}>
              This file type can't be shown here. Use Download to open it.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
