/** `/documents` route: full document library with drag-drop upload, AI-summary cards, search/type filtering, and a detail table. Opens a file on `/documents/:documentId`. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  listDocuments, getDocumentSummary, getDocumentDownloadUrl, deleteDocument,
  listCases, listDocumentTypes, uploadDocument, summarizeDocument,
  translateText, requestSignature,
} from '../../api/client'
import type { DocumentSummary, AiSummary, CaseSummary, DocumentTypeOption } from '../../types/api'
import { Icon } from '../../components/icons'
import { canRenderInline, formatSize, uploadRejection } from '../../utils/files'
import { formatDate as formatDateWith } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'
import shellStyles from '../../components/AppShell.module.css'

const MUTED = '#6E6759'
const PRIMARY = '#23306B'
// the languages /ai/translate maps to FLORES codes; it also accepts a raw code
const LANGUAGES = ['Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Gujarati']

// esign_status values that mean "nobody signed it" -- the Sign action reopens as "Resend"
// for these instead of staying hidden, same as a document that was never sent.
const ESIGN_RESENDABLE = new Set(['REJECTED', 'EXPIRED'])
const ESIGN_PILL: Record<string, { label: string; color: string; background: string }> = {
  COMPLETED: { label: 'Signed', color: '#4A6B4E', background: '#E4EDE5' },
  REJECTED: { label: 'Signature rejected', color: '#B3282D', background: '#F6E3E1' },
  EXPIRED: { label: 'Signature invite expired', color: '#B3282D', background: '#F6E3E1' },
}
function esignPill(status: string) {
  return ESIGN_PILL[status] ?? { label: 'Awaiting signature', color: '#8A6A2F', background: '#F3EBD9' }
}

function formatDate(iso: string) {
  return formatDateWith(iso, { month: 'short', day: 'numeric' })
}

/** Which stat card is currently acting as a filter; '' is the "Total Docs" card, i.e. no filter. */
type QuickFilter = '' | 'summary' | 'week' | 'case'

function matchesQuick(d: DocumentSummary, filter: QuickFilter, weekAgoMs: number) {
  if (filter === 'summary') return d.has_summary
  if (filter === 'week') return new Date(d.upload_date).getTime() >= weekAgoMs
  if (filter === 'case') return Boolean(d.case_number)
  return true
}


/**
 * Loads documents/cases/document-types in parallel (`listDocuments()`,
 * `listCases()`, `listDocumentTypes()`). Upload picks a file then confirms
 * case+type before calling `uploadDocument()`; row actions call
 * `getDocumentSummary()`, `getDocumentDownloadUrl()`/`openPreview` (via
 * the document preview page), and `deleteDocument()`.
 */
export default function DocumentsListPage() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [docTypes, setDocTypes] = useState<DocumentTypeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [summary, setSummary] = useState<AiSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [genText, setGenText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pickCaseId, setPickCaseId] = useState('')
  const [pickTypeId, setPickTypeId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [translateId, setTranslateId] = useState<number | null>(null)
  const [translateLang, setTranslateLang] = useState('')
  const [translation, setTranslation] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState('')

  const [signId, setSignId] = useState<number | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState('')

  const [toast, setToast] = useState('')
  // ?q= lets another page link straight to a filtered library (the admin console's
  // Cases tab links here by case number). Seeded once; the box is the owner after that.
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [typeFilter, setTypeFilter] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFiltersOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(timer)
  }, [toast])

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
    setGenText('')
    setGenError('')
    setSummaryLoading(true)
    getDocumentSummary(id)
      .then(setSummary)
      .catch((err) => setSummaryError(err instanceof Error ? err.message : 'No AI summary available.'))
      .finally(() => setSummaryLoading(false))
  }

  function toggleTranslate(id: number) {
    if (translateId === id) { setTranslateId(null); return }
    setTranslateId(id)
    setTranslateLang('')
    setTranslation('')
    setTranslateError('')
  }

  /** Translates the document's AI summary via `/ai/translate` (IndicTrans2). The summary is the
   * only document text the browser ever has, and the backend stores the result on the document's
   * `ai_summaries` row, so it comes back with the summary on the next load. */
  async function runTranslate(id: number, language: string) {
    setTranslateLang(language)
    setTranslation('')
    setTranslateError('')
    setTranslating(true)
    let source: string
    try {
      source = (await getDocumentSummary(id)).summary_text
    } catch {
      setTranslateError('Generate an AI summary for this document first -- translation runs on its summary text.')
      setTranslating(false)
      return
    }
    try {
      const { translated_text } = await translateText(source, language, id)
      setTranslation(translated_text)
      if (expandedId === id) setSummary((prev) => (prev ? { ...prev, translated_text } : prev))
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : 'Failed to translate.')
    } finally {
      setTranslating(false)
    }
  }

  function toggleSign(id: number) {
    if (signId === id) { setSignId(null); return }
    setSignId(id)
    // Pre-fill from the document's own case client -- this page lists documents across every
    // case at once, so leaving these blank risked a lawyer typing the wrong signer's email on
    // a list spanning many clients. Still editable, for a signer who isn't the case's client
    // (a builder, opposing counsel, etc.).
    const doc = documents.find((x) => x.id === id)
    const matchedCase = doc?.case_number ? cases.find((c) => c.id === doc.case_number) : undefined
    setSignerName(matchedCase?.client ?? '')
    setSignerEmail(matchedCase?.client_email ?? '')
    setSignError('')
  }

  /** Sends the document to Leegality for e-signature (`POST /documents/:id/request-signature`).
   * v1 is one signer at a time -- the backend already accepts a list, so multi-signer is just a
   * form change, not a backend one, whenever that's actually needed. */
  async function submitSign(id: number) {
    if (!signerName.trim() || !signerEmail.trim()) return
    setSigning(true)
    setSignError('')
    try {
      const updated = await requestSignature(id, [{ name: signerName.trim(), email: signerEmail.trim() }])
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)))
      setSignId(null)
      setToast('Sent for e-signature.')
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Failed to send for e-signature.')
    } finally {
      setSigning(false)
    }
  }

  // ponytail: the backing model is fine-tuned only on Supreme Court judgment
  // headnotes (ROUGE-L 0.2065, see finetune-summarizer/DOCUMENTATION.md) -- on
  // other document types (affidavits, agreements, notices) it tends to
  // hallucinate generic judgment-shaped boilerplate. Known quality ceiling,
  // accepted for now; upgrade path is fine-tuning on this app's own document
  // types or a larger base model.
  async function generateSummary(id: number) {
    setGenerating(true)
    setGenError('')
    try {
      const { summary: summaryText } = await summarizeDocument(id, genText)
      setSummary({ summary_text: summaryText, translated_text: null, keywords: null, important_dates: null, important_sections: null })
      setSummaryError('')
      setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, has_summary: true } : d)))
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate summary.')
    } finally {
      setGenerating(false)
    }
  }

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
    }
  }

  async function downloadDocument(id: number) {
    try {
      const { url } = await getDocumentDownloadUrl(id, true)
      window.location.href = url
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to download document.')
    }
  }


  function openPreview(d: DocumentSummary) {
    if (canRenderInline(d.mime_type)) navigate(`/documents/${d.id}`)
    else openDocument(d.id)
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

  function pickFile(file: File | undefined | null) {
    if (!file) return
    const rejection = uploadRejection(file)
    if (rejection) { setUploadError(rejection); setPendingFile(null); return }
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
    { label: 'Total Docs', value: documents.length, pct: 100, icon: 'file-text' as const, filter: '' as QuickFilter },
    { label: 'With AI Summary', value: withSummaryCount, pct: Math.round((withSummaryCount / total) * 100), icon: 'sparkles' as const, filter: 'summary' as QuickFilter },
    { label: 'Uploaded This Week', value: thisWeekCount, pct: Math.round((thisWeekCount / total) * 100), icon: 'calendar' as const, filter: 'week' as QuickFilter },
    { label: 'Cases Covered', value: casesCovered, pct: Math.round((casesCovered / total) * 100), icon: 'briefcase' as const, filter: 'case' as QuickFilter },
  ]

  const recentDocs = [...documents].sort((a, b) => b.upload_date.localeCompare(a.upload_date)).slice(0, 4)

  const searchLower = search.toLowerCase()
  const filteredDocuments = documents.filter((d) =>
    (!searchLower || d.file_name.toLowerCase().includes(searchLower) || (d.case_number ?? '').toLowerCase().includes(searchLower)) &&
    (!typeFilter || d.document_type === typeFilter) &&
    matchesQuick(d, quickFilter, weekAgoMs)
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
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.statCards}>
              {statCards.map((s) => (
                <div
                  key={s.label}
                  className={styles.statCard}
                  onClick={() => setQuickFilter(s.filter)}
                  title={`Show ${s.label.toLowerCase()}`}
                  style={{ cursor: 'pointer', ...(quickFilter === s.filter ? { background: '#F3EBD9', border: '1px solid #EAD49B' } : {}) }}
                >
                  <div className={styles.statIconRow}>
                    <div className={styles.statIconWrap}><Icon name={s.icon} size={18} color={PRIMARY} /></div>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em' }}>{s.label}</span>
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
                border: `2px dashed ${dragOver ? PRIMARY : '#CFC6B0'}`, borderRadius: 3, padding: '32px 20px',
                textAlign: 'center', cursor: 'pointer', background: dragOver ? '#F6F2E9' : '#FCFAF4',
              }}
            >
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,image/*,video/*" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0])} />
              <div style={{ width: 44, height: 44, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Icon name="upload-cloud" size={20} color={PRIMARY} strokeWidth={1.8} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A17' }}>Drop a file here, or click to browse</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>PDF, Word, images, or video · AI will extract, summarize, and index it automatically</div>
            </div>

            {pendingFile && (
              <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1A1A17' }}>Upload "{pendingFile.name}"</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <select value={pickCaseId} onChange={(e) => setPickCaseId(e.target.value)} style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }}>
                    <option value="">Select a case…</option>
                    {cases.map((c) => <option key={c.case_id} value={c.case_id}>{c.id} — {c.case_title ?? c.court}</option>)}
                  </select>
                  <select value={pickTypeId} onChange={(e) => setPickTypeId(e.target.value)} style={{ flex: 1, minWidth: 160, padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }}>
                    <option value="">Select a type…</option>
                    {docTypes.map((t) => <option key={t.document_type_id} value={t.document_type_id}>{t.type_name}</option>)}
                  </select>
                </div>
                {uploadError && <div style={{ fontSize: 12.5, color: '#B3282D' }}>{uploadError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className={styles.darkBtn} style={{ opacity: uploading ? 0.6 : 1 }} onClick={uploading ? undefined : confirmUpload}>{uploading ? 'Uploading…' : 'Upload'}</div>
                  <div className={styles.ghostChip} onClick={cancelUpload}>Cancel</div>
                </div>
              </div>
            )}

            {recentDocs.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {recentDocs.map((d) => (
                  <div key={d.id} className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="file-text" size={16} color={PRIMARY} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div onClick={() => openPreview(d)} style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{d.file_name}</div>
                          <span className={shellStyles.pill} style={d.has_summary ? { color: '#4A6B4E', background: '#E4EDE5', flexShrink: 0 } : { color: '#8A6A2F', background: '#F3EBD9', flexShrink: 0 }}>
                            {d.has_summary ? 'Completed' : 'Processing'}
                          </span>
                          {d.esign_status && (
                            <span className={shellStyles.pill} style={{ color: esignPill(d.esign_status).color, background: esignPill(d.esign_status).background, flexShrink: 0 }}>
                              {esignPill(d.esign_status).label}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{d.case_number ?? '—'} · {formatDate(d.upload_date)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F1EDE0', paddingTop: 10 }}>
                      <div onClick={() => toggleSummary(d.id)} className={styles.ghostChip} style={{ padding: '6px 12px', fontSize: 12, background: expandedId === d.id ? '#E6E0CE' : '#FCFAF4' }}>
                        <Icon name="sparkles" size={13} color="#575145" /> Summary
                      </div>
                      <div onClick={() => toggleTranslate(d.id)} className={styles.ghostChip} style={{ padding: '6px 12px', fontSize: 12, background: translateId === d.id ? '#E6E0CE' : '#FCFAF4' }} title="Translate the summary">
                        <Icon name="globe" size={13} color="#575145" /> Translate
                      </div>
                      {d.mime_type === 'application/pdf' && (!d.esign_status || ESIGN_RESENDABLE.has(d.esign_status)) && (
                        <div onClick={() => toggleSign(d.id)} className={styles.ghostChip} style={{ padding: '6px 12px', fontSize: 12, background: signId === d.id ? '#E6E0CE' : '#FCFAF4' }} title={d.esign_status ? 'Resend for e-signature' : 'Send for e-signature'}>
                          <Icon name="edit" size={13} color="#575145" /> {d.esign_status ? 'Resend' : 'Sign'}
                        </div>
                      )}
                    </div>
                    {expandedId === d.id && (
                      <div style={{ fontSize: 12.5, color: '#33302A', borderTop: '1px solid #F1EDE0', paddingTop: 10 }}>
                        {summaryLoading && <div style={{ color: MUTED }}>Loading summary…</div>}
                        {summary && <div>{summary.summary_text}</div>}
                        {summary?.translated_text && (
                          <div style={{ marginTop: 8, borderTop: '1px solid #F1EDE0', paddingTop: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em' }}>Translation</div>
                            <div style={{ marginTop: 3 }}>{summary.translated_text}</div>
                          </div>
                        )}
                        {!summaryLoading && !summary && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ color: MUTED }}>{summaryError || "No AI summary yet -- generate one from the stored file's text."}</div>
                            <textarea
                              value={genText}
                              onChange={(e) => setGenText(e.target.value)}
                              placeholder="Optional: paste the text instead (for scans, or file types with no text layer)…"
                              rows={3}
                              style={{ padding: '8px 10px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' }}
                            />
                            {genError && <div style={{ color: '#B3282D' }}>{genError}</div>}
                            <div
                              className={styles.ghostChip}
                              style={{ alignSelf: 'flex-start', padding: '6px 12px', opacity: generating ? 0.6 : 1, cursor: generating ? 'default' : 'pointer' }}
                              onClick={generating ? undefined : () => generateSummary(d.id)}
                            >
                              {generating ? 'Generating…' : 'Generate Summary'}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {translateId === d.id && (
                      <div style={{ fontSize: 12.5, color: '#33302A', borderTop: '1px solid #F1EDE0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {LANGUAGES.map((lang) => (
                            <div
                              key={lang}
                              onClick={() => !translating && runTranslate(d.id, lang)}
                              className={styles.ghostChip}
                              style={{ padding: '4px 10px', fontSize: 11.5, cursor: translating ? 'default' : 'pointer', background: translateLang === lang ? '#E6E0CE' : '#FCFAF4' }}
                            >
                              {lang}
                            </div>
                          ))}
                        </div>
                        {translating && <div style={{ color: MUTED }}>Translating into {translateLang}…</div>}
                        {translateError && <div style={{ color: MUTED }}>{translateError}</div>}
                        {translation && <div style={{ lineHeight: 1.6 }}>{translation}</div>}
                        {!translating && !translateError && !translation && <div style={{ color: MUTED }}>Pick a language to translate this document's summary.</div>}
                      </div>
                    )}
                    {signId === d.id && (
                      <div style={{ fontSize: 12.5, color: '#33302A', borderTop: '1px solid #F1EDE0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                          placeholder="Signer's name"
                          style={{ padding: '7px 10px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 12.5 }}
                        />
                        <input
                          value={signerEmail}
                          onChange={(e) => setSignerEmail(e.target.value)}
                          placeholder="Signer's email"
                          type="email"
                          style={{ padding: '7px 10px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 12.5 }}
                        />
                        {signError && <div style={{ color: '#B3282D' }}>{signError}</div>}
                        <div
                          className={styles.ghostChip}
                          style={{ alignSelf: 'flex-start', padding: '6px 12px', opacity: signing || !signerName.trim() || !signerEmail.trim() ? 0.6 : 1, cursor: signing ? 'default' : 'pointer' }}
                          onClick={signing ? undefined : () => submitSign(d.id)}
                        >
                          {signing ? 'Sending…' : 'Send for signature'}
                        </div>
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
                style={{ flex: 1, padding: '9px 14px', borderRadius: 3, border: '1px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }}
              />
              <div ref={filterRef} style={{ position: 'relative' }}>
                <div
                  className={styles.ghostChip}
                  onClick={() => setFiltersOpen((o) => !o)}
                  style={{ borderColor: typeFilter ? PRIMARY : undefined }}
                >
                  <Icon name="filter" size={14} color="#575145" /> Filters
                </div>
                {filtersOpen && (
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#FCFAF4', border: '1px solid #CFC6B0', borderRadius: 3, boxShadow: '0 10px 24px rgba(35, 48, 107,.12)', padding: 6, width: 180, zIndex: 30 }}>
                    <div
                      onClick={() => { setTypeFilter(''); setFiltersOpen(false) }}
                      style={{ padding: '8px 10px', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: !typeFilter ? '#1A2551' : '#1A1A17', background: !typeFilter ? '#F3EBD9' : 'transparent' }}
                    >
                      All Categories
                    </div>
                    {docTypes.map((t) => (
                      <div
                        key={t.document_type_id}
                        onClick={() => { setTypeFilter(t.type_name); setFiltersOpen(false) }}
                        style={{ padding: '8px 10px', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: typeFilter === t.type_name ? '#1A2551' : '#1A1A17', background: typeFilter === t.type_name ? '#F3EBD9' : 'transparent' }}
                      >
                        {t.type_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                      <td className={styles.tdClient} onClick={() => openPreview(d)} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon name="file-text" size={14} color={PRIMARY} />
                          </div>
                          {d.file_name}
                        </div>
                      </td>
                      <td className={styles.td}>{d.document_type ? <span className={shellStyles.pill} style={{ color: '#575145', background: '#E6E0CE' }}>{d.document_type}</span> : '—'}</td>
                      <td className={styles.tdMono}>
                        {d.case_number ? (
                          <span
                            onClick={() => openCase(d.case_number)}
                            style={{ cursor: caseIdOf(d.case_number) ? 'pointer' : 'default', textDecoration: caseIdOf(d.case_number) ? 'underline' : 'none' }}
                          >
                            {d.case_number}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={styles.td}>{formatDate(d.upload_date)}</td>
                      <td className={styles.td}>{formatSize(d.file_size)}</td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <div onClick={() => openDocument(d.id)} className={shellStyles.actionBtn} title="Open in browser"><Icon name="globe" size={14} color="#575145" /></div>
                          <div onClick={() => downloadDocument(d.id)} className={shellStyles.actionBtn} title="Download"><Icon name="download" size={14} color="#575145" /></div>
                          <div onClick={() => openPreview(d)} className={shellStyles.actionBtn} title="Preview"><Icon name="eye" size={14} color="#575145" /></div>
                          <div onClick={() => removeDocument(d.id)} className={shellStyles.actionBtnDanger} title="Delete"><Icon name="trash-2" size={14} color="#B3282D" /></div>
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

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
