/** Admin console "Documents" tab: read-only table of all uploaded documents (`listDocuments()`). */
import { useEffect, useState } from 'react'
import { C } from '../../../components/theme'
import { listDocuments } from '../../../api/client'
import type { DocumentSummary } from '../../../types/api'
import styles from '../../../components/AppShell.module.css'

const DOC_COLUMNS = ['File', 'Type', 'Case', 'Uploaded By', 'Upload Date']

/** Fetches all documents via `listDocuments()` and lists them. */
export default function DocumentsView() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load documents.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Documents</div>
        <div className={styles.pageSubtitle}>Every uploaded document across cases.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div className={styles.cardTitle}>All Documents</div>
        </div>
        {loading && <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>Loading documents…</div>}
        {error && <div style={{ padding: '24px 4px', color: C.danger, fontSize: 13.5 }}>{error}</div>}
        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>{DOC_COLUMNS.map((col) => <th key={col} className={styles.th}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className={styles.tr}>
                    <td className={styles.td} style={{ fontWeight: 600, color: '#1A1A17' }}>{doc.file_name}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{doc.document_type ?? '—'}</td>
                    <td className={styles.td} style={{ color: '#6E6759' }}>{doc.case_number ?? '—'}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{doc.uploaded_by ?? '—'}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{doc.upload_date}</td>
                  </tr>
                ))}
                {documents.length === 0 && (
                  <tr><td className={styles.td} colSpan={DOC_COLUMNS.length} style={{ color: C.muted, textAlign: 'center', padding: '24px 4px' }}>No documents uploaded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
