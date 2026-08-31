import { useEffect, useRef, useState } from 'react'
import {
  listDocuments, getDocumentSummary, getDocumentDownloadUrl, deleteDocument,
  listCases, listDocumentTypes, uploadDocument,
} from '../../api/client'
import type { DocumentSummary, AiSummary, CaseSummary, DocumentTypeOption } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'
import shellStyles from '../../components/AppShell.module.css'

const MUTED = '#8C7C5E'
const PRIMARY = '#B08D3E'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatSize(bytes: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsListPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [docTypes, setDocTypes] = useState<DocumentTypeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [summary, setSummary] = useState<AiSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pickCaseId, setPickCaseId] = useState('')
  const [pickTypeId, setPickTypeId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    Promise.all([listDocuments(), listCases(), listDocumentTypes()])
      .then(([d, c, t]) => { setDocuments(d); setCases(c); setDocTypes(t) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load documents.'))
      .finally(() => setLoading(false))
  }, [])

  function toggleSummary(id: number) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setSummary(null)
    setSummaryError('')
    setSummaryLoading(true)
    getDocumentSummary(id)
      .then(setSummary)
      .catch((err) => setSummaryError(err instanceof Error ? err.message : 'No AI summary available.'))
      .finally(() => setSummaryLoading(false))
  }

  async function openDocument(id: number) {
    const tab = window.open('', '_blank')
    try {
      const { url } = await getDocumentDownloadUrl(id)
      if (tab) tab.location.href = url
    } catch {
      tab?.close()
    }
  }

  async function removeDocument(id: number) {
    if (!window.confirm('Delete this document? This cannot be undone.')) return
    try {
      await deleteDocument(id)
      setDocuments((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to delete document.')
    }
  }

  function pickFile(file: File | undefined | null) {
    if (!file) return
    setUploadError('')
    setPendingFile(file)
    setPickCaseId(cases.length === 1 ? String(cases[0].case_id) : '')
    setPickTypeId('')
  }

  function cancelUpload() {
    setPendingFile(null)
    setPickCaseId('')
    setPickTypeId('')
    setUploadError('')
  }

  async function confirmUpload() {
    if (!pendingFile || !pickCaseId || !pickTypeId) { setUploadError('Choose a case and a document type.'); return }
    setUploading(true)
    setUploadError('')
    try {
      const created = await uploadDocument(Number(pickCaseId), pendingFile, Number(pickTypeId))
      setDocuments((prev) => [created, ...prev])
      cancelUpload()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload document.')
    } finally {
      setUploading(false)
    }
  }

  const weekAgoMs = Date.now() - 7 * 86400000
  const withSummaryCount = documents.filter((d) => d.has_summary).length
  const thisWeekCount = documents.filter((d) => new Date(d.upload_date).getTime() >= weekAgoMs).length
  const casesCovered = new Set(documents.map((d) => d.case_number).filter(Boolean)).size
  const total = documents.length || 1

  const statCards = [
    { label: 'Total Docs', value: documents.length, pct: 100, icon: 'file-text' as const },
    { label: 'With AI Summary', value: withSummaryCount, pct: Math.round((withSummaryCount / total) * 100), icon: 'sparkles' as const },
    { label: 'Uploaded This Week', value: thisWeekCount, pct: Math.round((thisWeekCount / total) * 100), icon: 'calendar' as const },
    { label: 'Cases Covered', value: casesCovered, pct: Math.round((casesCovered / total) * 100), icon: 'briefcase' as const },
  ]

  const summarizedDocs = [...documents].filter((d) => d.has_summary).sort((a, b) => b.upload_date.localeCompare(a.upload_date)).slice(0, 3)

  const searchLower = search.toLowerCase()
  const filteredDocuments = documents.filter((d) =>
    (!searchLower || d.file_name.toLowerCase().includes(searchLower) || (d.case_number ?? '').toLowerCase().includes(searchLower)) &&
    (!typeFilter || d.document_type === typeFilter)
  )

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Documents</div>
            <div className={styles.subtitle}>Access, organize and download all documents shared across your matters. AI-powered summaries give instant clarity on complex filings.</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading documents…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.statCards}>
              {statCards.map((s) => (
                <div key={s.label} className={styles.statCard}>
                  <div className={styles.statIconRow}>
                    <div className={styles.statIconWrap}><Icon name={s.icon} size={18} color={PRIMARY} /></div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>{s.label}</span>
                  </div>
                  <div className={styles.statValue}>{String(s.value).padStart(2, '0')}</div>
                  <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${s.pct}%` }} /></div>
                </div>
              ))}
            </div>

            <div className={styles.sectionTitle} style={{ fontSize: 15 }}>AI-processed case documents & summaries</div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0]) }}
              style={{
                border: `2px dashed ${dragOver ? PRIMARY : '#E7DCC6'}`, borderRadius: 16, padding: '32px 20px',
                textAlign: 'center', cursor: 'pointer', background: dragOver ? '#FBF7EE' : '#FFFFFF',
              }}
            >
              <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0])} />
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Icon name="download" size={20} color={PRIMARY} strokeWidth={1.8} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#2A2118' }}>Drop a PDF here, or click to browse</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>AI will extract, summarize, and index it automatically</div>
            </div>

            {pendingFile && (
              <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>Upload "{pendingFile.name}"</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <select value={pickCaseId} onChange={(e) => setPickCaseId(e.target.value)} style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
                    <option value="">Select a case…</option>
                    {cases.map((c) => <option key={c.case_id} value={c.case_id}>{c.id} — {c.case_title ?? c.court}</option>)}
                  </select>
                  <select value={pickTypeId} onChange={(e) => setPickTypeId(e.target.value)} style={{ flex: 1, minWidth: 160, padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
                    <option value="">Select a type…</option>
                    {docTypes.map((t) => <option key={t.document_type_id} value={t.document_type_id}>{t.type_name}</option>)}
                  </select>
                </div>
                {uploadError && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{uploadError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className={styles.darkBtn} style={{ opacity: uploading ? 0.6 : 1 }} onClick={uploading ? undefined : confirmUpload}>{uploading ? 'Uploading…' : 'Upload'}</div>
                  <div className={styles.ghostChip} onClick={cancelUpload}>Cancel</div>
                </div>
              </div>
            )}

            {summarizedDocs.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {summarizedDocs.map((d) => (
                  <div key={d.id} className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="file-text" size={16} color={PRIMARY} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
                        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{d.case_number ?? '—'} · {formatDate(d.upload_date)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #F1E9D9', paddingTop: 10 }}>
                      <div onClick={() => toggleSummary(d.id)} className={shellStyles.actionBtn} style={{ background: expandedId === d.id ? '#EFE4CB' : '#F5EFDF' }} title="Summary"><Icon name="sparkles" size={14} color="#6A5C42" /></div>
                      <div onClick={() => openDocument(d.id)} className={shellStyles.actionBtn} title="Download"><Icon name="download" size={14} color="#6A5C42" /></div>
                      <div onClick={() => removeDocument(d.id)} className={shellStyles.actionBtnDanger} title="Delete"><Icon name="trash-2" size={14} color="#B05C5C" /></div>
                    </div>
                    {expandedId === d.id && (
                      <div style={{ fontSize: 12.5, color: '#3D3126', borderTop: '1px solid #F1E9D9', paddingTop: 10 }}>
                        {summaryLoading && <div style={{ color: MUTED }}>Loading summary…</div>}
                        {summaryError && <div style={{ color: MUTED }}>{summaryError}</div>}
                        {summary && <div>{summary.summary_text}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                placeholder="Search by document name, case number…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
              >
                <option value="">All types</option>
                {docTypes.map((t) => <option key={t.document_type_id} value={t.type_name}>{t.type_name}</option>)}
              </select>
            </div>

            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Document Name</th>
                    <th className={styles.th}>Category</th>
                    <th className={styles.th}>Related Case</th>
                    <th className={styles.th}>Upload Date</th>
                    <th className={styles.th}>Size</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((d) => (
                    <tr key={d.id} className={styles.tr}>
                      <td className={styles.tdClient}>{d.file_name}</td>
                      <td className={styles.td}>{d.document_type ?? '—'}</td>
                      <td className={styles.tdMono}>{d.case_number ?? '—'}</td>
                      <td className={styles.td}>{formatDate(d.upload_date)}</td>
                      <td className={styles.td}>{formatSize(d.file_size)}</td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <div onClick={() => toggleSummary(d.id)} style={{ cursor: 'pointer', display: 'flex' }} title="View summary"><Icon name="eye" size={16} color="#6A5C42" /></div>
                          <div onClick={() => openDocument(d.id)} style={{ cursor: 'pointer', display: 'flex' }} title="Download"><Icon name="download" size={16} color="#6A5C42" /></div>
                          <div onClick={() => removeDocument(d.id)} style={{ cursor: 'pointer', display: 'flex' }} title="Delete"><Icon name="trash-2" size={16} color="#B05C5C" /></div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredDocuments.length === 0 && (
                    <tr><td className={styles.td} colSpan={6} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No documents found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
