import { Fragment, useEffect, useState } from 'react'
import { Icon } from '../../../components/icons'
import { C } from '../theme'
import { listDocuments, getDocumentSummary } from '../../../api/client'
import type { DocumentSummary, AiSummary } from '../../../types/api'
import styles from '../adminShared.module.css'

const DOC_COLUMNS = ['File', 'Type', 'Case', 'Uploaded By', 'Upload Date', 'Actions']

export default function DocumentsView() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [summary, setSummary] = useState<AiSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load documents.'))
      .finally(() => setLoading(false))
  }, [])

  function toggleSummary(id: number) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    setSummary(null)
    setSummaryError('')
    setSummaryLoading(true)
    getDocumentSummary(id)
      .then(setSummary)
      .catch((err) => setSummaryError(err instanceof Error ? err.message : 'No AI summary available.'))
      .finally(() => setSummaryLoading(false))
  }

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Documents</div>
        <div className={styles.pageSubtitle}>Every uploaded document across cases, with AI-generated summaries where available.</div>
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
                  <Fragment key={doc.id}>
                    <tr className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 600, color: '#2A2118' }}>{doc.file_name}</td>
                      <td className={styles.td} style={{ color: '#3D3126' }}>{doc.document_type ?? '—'}</td>
                      <td className={styles.td} style={{ color: '#8C7C5E' }}>{doc.case_number ?? '—'}</td>
                      <td className={styles.td} style={{ color: '#3D3126' }}>{doc.uploaded_by ?? '—'}</td>
                      <td className={styles.td} style={{ color: '#3D3126' }}>{doc.upload_date}</td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <span className={styles.actionBtn} title="AI Summary" onClick={() => toggleSummary(doc.id)}>
                            <Icon name="sparkles" size={15} color={expandedId === doc.id ? C.primary : '#6A5C42'} />
                          </span>
                          <span className={styles.actionBtn} title="Download"><Icon name="download" size={15} color="#6A5C42" /></span>
                        </div>
                      </td>
                    </tr>
                    {expandedId === doc.id && (
                      <tr>
                        <td className={styles.td} colSpan={DOC_COLUMNS.length} style={{ background: '#FBF7ED' }}>
                          {summaryLoading && <div style={{ color: C.muted, fontSize: 13 }}>Loading summary…</div>}
                          {summaryError && <div style={{ color: C.muted, fontSize: 13 }}>{summaryError}</div>}
                          {summary && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#3D3126', padding: '4px 0' }}>
                              <div><strong>Summary:</strong> {summary.summary_text}</div>
                              {summary.keywords && <div><strong>Keywords:</strong> {summary.keywords}</div>}
                              {summary.important_dates && <div><strong>Important dates:</strong> {summary.important_dates}</div>}
                              {summary.important_sections && <div><strong>Important sections:</strong> {summary.important_sections}</div>}
                              {summary.translated_text && <div><strong>Translation:</strong> {summary.translated_text}</div>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
