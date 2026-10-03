/** Admin console "Documents" tab: table of all uploaded documents (`listDocuments()`),
 * with the same open/case-navigation behavior as the lawyer-facing documents page. */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../../../components/theme'
import { listDocuments, listCases, getDocumentDownloadUrl, deleteDocument } from '../../../api/client'
import type { DocumentSummary, CaseSummary } from '../../../types/api'
import { formatDate } from '../../../utils/date'
import { Icon } from '../../../components/icons'
import styles from '../../../components/AppShell.module.css'

const DOC_COLUMNS = ['File', 'Type', 'Case', 'Uploaded By', 'Upload Date', 'Actions']

/** Fetches all documents via `listDocuments()` and lists them. */
export default function DocumentsView() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    Promise.all([listDocuments(), listCases()])
      .then(([docs, allCases]) => { setDocuments(docs); setCases(allCases) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load documents.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function caseIdOf(caseNumber: string | null) {
    return cases.find((c) => c.id === caseNumber)?.case_id
  }

  function openCase(caseNumber: string | null) {
    const caseId = caseIdOf(caseNumber)
    if (caseId) navigate(`/cases/${caseId}`)
    else setToast("That case isn't in your list.")
  }

  async function openDocument(id: number) {
    const tab = window.open('', '_blank')
    try {
      const { url } = await getDocumentDownloadUrl(id)
      if (tab) tab.location.href = url
    } catch {
      tab?.close()
      setToast('Failed to open document.')
    }
  }

  async function removeDocument(id: number) {
    if (!window.confirm('Delete this document? This cannot be undone.')) return
    try {
      await deleteDocument(id)
      setDocuments((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to delete document.')
    }
  }

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
                    <td
                      className={styles.td}
                      style={{
                        color: '#6E6759',
                        cursor: caseIdOf(doc.case_number) ? 'pointer' : 'default',
                        textDecoration: caseIdOf(doc.case_number) ? 'underline' : 'none',
                      }}
                      onClick={() => openCase(doc.case_number)}
                    >
                      {doc.case_number ?? '—'}
                    </td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{doc.uploaded_by ?? '—'}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{formatDate(doc.upload_date)}</td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <div onClick={() => openDocument(doc.id)} className={styles.actionBtn} title="Open"><Icon name="globe" size={14} color="#575145" /></div>
                        <div onClick={() => removeDocument(doc.id)} className={styles.actionBtnDanger} title="Delete"><Icon name="trash-2" size={14} color="#B3282D" /></div>
                      </div>
                    </td>
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

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  )
}
