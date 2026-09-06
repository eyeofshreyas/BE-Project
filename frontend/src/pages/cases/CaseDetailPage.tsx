/** `/cases/:caseId` route: full case detail with an AI-generated case summary, notes (with
 * optional checklists), timeline, meetings, and documents (preview via `DocumentPreviewModal`).
 * Role controls which actions (status change, unassign, add/edit note, upload) are shown. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listCases, listCaseNotes, addCaseNote, updateCaseNote, deleteCaseNote, listCaseTimeline, changeCaseStatus,
  listDocuments, listMeetings, listDocumentTypes, uploadDocument, getDocumentDownloadUrl,
  unassignLawyer, getCaseAiSummary, generateCaseAiSummary, getOrCreateConversation,
} from '../../api/client'
import type {
  CaseSummary, NoteSummary, ChecklistItem, TimelineEvent, DocumentSummary, MeetingSummary,
  DocumentTypeOption, UserProfile, CaseAiSummary,
} from '../../types/api'
import { formatDate as formatDateWith } from '../../utils/date'
import DocumentPreviewModal, { isPreviewable } from '../../components/DocumentPreviewModal'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'
import { Dropdown } from '../conveyancing/ConveyancingDashboardPage'

const PRIMARY = '#B08D3E'
const MUTED = '#8C7C5E'

const ADMIN = 1
const LAWYER = 2
const CLIENT = 3

const STATUS_OPTIONS = ['Open', 'In Progress', 'Pending', 'Completed', 'Closed']
const STATUS_LABELS: Record<string, string> = { Open: 'Active' }
function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s
}
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Completed: ['#2E9E58', '#E4F5EA'],
  Closed: ['#2E9E58', '#E4F5EA'],
  Open: ['#B87F1E', '#FFF2E0'],
  'In Progress': ['#B87F1E', '#FFF2E0'],
  Pending: ['#B87F1E', '#FFF2E0'],
}
const PRIORITY_COLORS: Record<string, string> = { High: '#B05C5C', Medium: '#B87F1E', Low: '#2E9E58' }

const inputStyle = { padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatDate(iso: string) {
  return formatDateWith(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string) {
  return formatDateWith(iso, { day: 'numeric', month: 'short', year: 'numeric' })
}

type NoteForm = { id: number | null; title: string; note: string; checklist: ChecklistItem[] }
const BLANK_FORM: NoteForm = { id: null, title: '', note: '', checklist: [] }

/**
 * Loads all cases via `listCases()` and finds this one by `caseId` (there's
 * no single-case GET endpoint), plus notes/timeline/documents/meetings/AI-summary in
 * parallel. Wires up note CRUD (incl. checklist + pin), status change, lawyer unassign,
 * meeting scheduling, AI summary generation, and document upload/preview/download.
 */
export default function CaseDetailPage() {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const profile = loadProfile()
  const canManage = profile?.role_id === LAWYER || profile?.role_id === ADMIN
  const canAddNote = profile?.role_id === LAWYER
  const canMessage = profile?.role_id === LAWYER
  const canUploadDocs = profile?.role_id === CLIENT || profile?.role_id === LAWYER

  const [caseInfo, setCaseInfo] = useState<CaseSummary | null>(null)
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [noteSearch, setNoteSearch] = useState('')
  const [noteForm, setNoteForm] = useState<NoteForm | null>(null)
  const [checklistDraft, setChecklistDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const [aiSummary, setAiSummary] = useState<CaseAiSummary | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const [statusSaving, setStatusSaving] = useState(false)
  const [unassigning, setUnassigning] = useState(false)
  const [messaging, setMessaging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const meetingsRef = useRef<HTMLDivElement>(null)
  const documentsRef = useRef<HTMLDivElement>(null)

  const [uploadTypeId, setUploadTypeId] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadFormOpen, setUploadFormOpen] = useState(false)

  const numericCaseId = Number(caseId)

  useEffect(() => {
    if (!numericCaseId) { setError('Invalid case.'); setLoading(false); return }
    Promise.all([listCases(), listCaseNotes(numericCaseId), listCaseTimeline(numericCaseId), listDocuments(), listMeetings(numericCaseId)])
      .then(([cases, n, t, docs, m]) => {
        const found = cases.find((c) => c.case_id === numericCaseId)
        if (!found) { setError("This case doesn't exist or you don't have access to it."); return }
        setCaseInfo(found)
        setNotes(n)
        setTimeline(t)
        setDocuments(docs.filter((d) => d.case_number === found.id))
        setMeetings(m)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this case.'))
      .finally(() => setLoading(false))
    if (canUploadDocs) listDocumentTypes().then(setDocumentTypes).catch(() => {})
    getCaseAiSummary(numericCaseId).then(setAiSummary).catch(() => setAiSummary(null))
  }, [numericCaseId, canUploadDocs])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function submitNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      const created = await addCaseNote(numericCaseId, newNote.trim())
      setNotes((prev) => [created, ...prev])
      setNewNote('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add note.')
    } finally {
      setAddingNote(false)
    }
  }

  function addChecklistDraftItem() {
    if (!checklistDraft.trim() || !noteForm) return
    setNoteForm({ ...noteForm, checklist: [...noteForm.checklist, { text: checklistDraft.trim(), checked: false }] })
    setChecklistDraft('')
  }

  async function saveNoteForm() {
    if (!noteForm || !noteForm.note.trim()) return
    setSavingNote(true)
    try {
      const title = noteForm.title.trim()
      const note = noteForm.note.trim()
      const checklist = noteForm.checklist.length ? noteForm.checklist : undefined
      if (noteForm.id === null) {
        const created = await addCaseNote(numericCaseId, note, { title: title || undefined, checklist })
        setNotes((prev) => [created, ...prev])
      } else {
        const updated = await updateCaseNote(numericCaseId, noteForm.id, { title: title || null, note, checklist: checklist ?? null })
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
      }
      setNoteForm(null)
      setChecklistDraft('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save note.')
    } finally {
      setSavingNote(false)
    }
  }

  async function togglePin(n: NoteSummary) {
    try {
      const updated = await updateCaseNote(numericCaseId, n.id, { pinned: !n.pinned })
      setNotes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update note.')
    }
  }

  async function toggleChecklistItem(n: NoteSummary, index: number) {
    if (!n.checklist) return
    const checklist = n.checklist.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item))
    try {
      const updated = await updateCaseNote(numericCaseId, n.id, { checklist })
      setNotes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update checklist.')
    }
  }

  async function removeNote(noteId: number) {
    if (!window.confirm('Delete this note?')) return
    try {
      await deleteCaseNote(numericCaseId, noteId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete note.')
    }
  }

  async function generateSummary() {
    setAiLoading(true)
    try {
      const result = await generateCaseAiSummary(numericCaseId)
      setAiSummary(result)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to generate AI summary.')
    } finally {
      setAiLoading(false)
    }
  }

  async function updateStatus(newStatus: string) {
    if (!caseInfo || newStatus === caseInfo.status) return
    setStatusSaving(true)
    try {
      await changeCaseStatus(numericCaseId, newStatus)
      setCaseInfo({ ...caseInfo, status: newStatus })
      listCaseTimeline(numericCaseId).then(setTimeline).catch(() => {})
      showToast('Status updated.')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  function closeCase() {
    if (!window.confirm('Close this case?')) return
    updateStatus('Closed')
  }

  async function messageClient() {
    if (!caseInfo?.client_id) return
    setMessaging(true)
    try {
      const conversation = await getOrCreateConversation(caseInfo.client_id)
      navigate(`/messages/${conversation.id}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open conversation.')
    } finally {
      setMessaging(false)
    }
  }

  async function unassign() {
    if (!caseInfo || !window.confirm('Remove the assigned lawyer from this case?')) return
    setUnassigning(true)
    try {
      const updated = await unassignLawyer(numericCaseId)
      setCaseInfo(updated)
      showToast('Lawyer unassigned.')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to unassign lawyer.')
    } finally {
      setUnassigning(false)
    }
  }

  async function submitUpload() {
    if (!uploadFile || !uploadTypeId) return
    setUploading(true)
    try {
      const created = await uploadDocument(numericCaseId, uploadFile, Number(uploadTypeId))
      setDocuments((prev) => [...prev, created])
      setUploadFile(null)
      setUploadTypeId('')
      setUploadFormOpen(false)
      showToast('Document uploaded.')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to upload document.')
    } finally {
      setUploading(false)
    }
  }

  async function downloadDocument(documentId: number) {
    const tab = window.open('', '_blank') // opened synchronously so popup blockers allow it
    try {
      const { url } = await getDocumentDownloadUrl(documentId)
      if (tab) tab.location.href = url
    } catch (err) {
      tab?.close()
      showToast(err instanceof Error ? err.message : 'Failed to open document.')
    }
  }

  const [previewDoc, setPreviewDoc] = useState<DocumentSummary | null>(null)

  /** Dispatches on mime type: previewable types open `DocumentPreviewModal`, others go straight to `downloadDocument()`. */
  function openDocument(d: DocumentSummary) {
    if (isPreviewable(d.mime_type)) setPreviewDoc(d)
    else downloadDocument(d.id)
  }

  if (loading) return <div className={styles.page}><div className={styles.wrap}><div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading case…</div></div></div>
  if (error || !caseInfo) return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>
        <div className={styles.ghostChip} style={{ width: 'fit-content' }} onClick={() => navigate(-1)}>Back</div>
      </div>
    </div>
  )

  const [statusColor, statusBg] = STATUS_STYLE_MAP[caseInfo.status] || ['#6A5C42', '#EFEAE1']
  const filteredNotes = notes
    .filter((n) => !noteSearch.trim() || `${n.title ?? ''} ${n.note}`.toLowerCase().includes(noteSearch.trim().toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ background: '#FBF6EA', border: '1px solid #E7DCC6', borderRadius: 20, padding: '22px 26px 26px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid #E7DCC6' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer' }} onClick={() => navigate(-1)}>Back to Cases</div>
            <span style={{ cursor: 'pointer', display: 'flex' }} onClick={() => navigate(-1)}><Icon name="x" size={16} color={MUTED} /></span>
          </div>

          <div style={{ padding: '16px 0', borderBottom: '1px solid #E7DCC6' }}>
            <div className={styles.statLabel}>{caseInfo.id}</div>
            <div className={styles.title} style={{ fontSize: 20, marginTop: 2 }}>{caseInfo.case_title ?? caseInfo.court ?? 'No court assigned'}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <span className={styles.statusBadge} style={{ color: statusColor, background: statusBg }}>{statusLabel(caseInfo.status)}</span>
              <span className={styles.statusBadge} style={{ color: PRIORITY_COLORS[caseInfo.priority] ?? '#6A5C42', background: '#EFEAE1' }}>{caseInfo.priority} priority</span>
            </div>
          </div>

          <div className={styles.midGrid} style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className={styles.statLabel}>Client</div>
                <div className={styles.statValue} style={{ fontSize: 16 }}>{caseInfo.client ?? '—'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className={styles.statLabel}>Type</div>
                <div className={styles.statValue} style={{ fontSize: 16 }}>{caseInfo.case_type ?? '—'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className={styles.statLabel}>Next Hearing</div>
                <div className={styles.statValue} style={{ fontSize: 16 }}>{caseInfo.hearing ?? '—'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className={styles.statLabel}>Lawyer</div>
                <div className={styles.statValue} style={{ fontSize: 16 }}>{caseInfo.lawyer ?? 'Not yet assigned'}</div>
                {canManage && caseInfo.lawyer && (
                  <div
                    onClick={() => !unassigning && unassign()}
                    style={{ fontSize: 11.5, fontWeight: 600, color: '#B05C5C', cursor: 'pointer', opacity: unassigning ? 0.6 : 1 }}
                  >
                    {unassigning ? 'Removing…' : 'Unassign'}
                  </div>
                )}
              </div>
              {canManage && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className={styles.statLabel}>Change Status</div>
                  <Dropdown value={caseInfo.status} options={STATUS_OPTIONS} labelFor={statusLabel} onChange={(s) => !statusSaving && updateStatus(s)} />
                </div>
              )}
            </div>

            <div className={styles.panelCard}>
              <div className={styles.panelTitle} style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="sparkles" size={15} color={PRIMARY} /> AI Summary</div>
              {aiSummary ? (
                <div style={{ fontSize: 13.5, color: '#2A2118', lineHeight: 1.55 }}>
                  <div>{aiSummary.summary_text}</div>
                  {aiSummary.related_cases.length > 0 && (
                    <div style={{ marginTop: 8, color: MUTED, fontSize: 12.5 }}>
                      AI flags this as related to {aiSummary.related_cases.length} prior precedent{aiSummary.related_cases.length > 1 ? 's' : ''} on file: {aiSummary.related_cases.map((r) => r.doc_id).join(', ')}
                    </div>
                  )}
                  <div style={{ marginTop: 8, color: MUTED, fontSize: 11.5 }}>Generated {formatDate(aiSummary.generated_at)}</div>
                </div>
              ) : (
                <div style={{ color: MUTED, fontSize: 13 }}>No AI summary generated yet.</div>
              )}
            </div>

            <div>
              <div className={styles.panelTitle}>Case Timeline</div>
              <div className={styles.timeline}>
                {timeline.map((t) => (
                  <div key={t.id} className={styles.timelineItem}>
                    <span className={styles.timelineDot} style={{ background: PRIMARY }} />
                    <div className={styles.timelineTitle}>{t.event_title}</div>
                    {t.event_description && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{t.event_description}</div>}
                    <div className={styles.timelineMeta}>{formatDate(t.created_at)}{t.created_by ? ` · ${t.created_by}` : ''}</div>
                  </div>
                ))}
                {timeline.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No activity yet.</div>}
              </div>
            </div>

            <div ref={meetingsRef}>
              <div className={styles.panelTitle}>Meetings & Hearings</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {meetings.map((m) => (
                  <div key={m.id} style={{ padding: '10px 14px', border: '1px solid #E7DCC6', borderRadius: 10 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>{m.meeting_title ?? 'Meeting'}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 5 }}>{formatDate(m.meeting_date)} · {m.meeting_status}{m.conducted_by ? ` · ${m.conducted_by}` : ''}</div>
                  </div>
                ))}
                {meetings.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No meetings scheduled.</div>}
              </div>
            </div>

            <div ref={documentsRef}>
              <div className={styles.panelTitle}>Uploaded Documents</div>
              {canUploadDocs && uploadFormOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  <select
                    value={uploadTypeId}
                    onChange={(e) => setUploadTypeId(e.target.value)}
                    style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13, background: '#FFFFFF' }}
                  >
                    <option value="">Document type…</option>
                    {documentTypes.map((t) => <option key={t.document_type_id} value={t.document_type_id}>{t.type_name}</option>)}
                  </select>
                  <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12.5 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div className={styles.primaryChip} style={{ opacity: uploading || !uploadFile || !uploadTypeId ? 0.6 : 1, justifyContent: 'center', flex: 1 }} onClick={submitUpload}>
                      {uploading ? 'Uploading…' : 'Upload'}
                    </div>
                    <div className={styles.ghostChip} onClick={() => setUploadFormOpen(false)}>Cancel</div>
                  </div>
                </div>
              )}
              <div className={styles.quickActionsList}>
                {documents.map((d) => (
                  <div key={d.id} className={styles.quickAction} onClick={() => openDocument(d)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="file-text" size={18} color={MUTED} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{d.file_name}</div>
                        <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400, marginTop: 2 }}>{formatDay(d.upload_date)}</div>
                      </div>
                    </div>
                    <span className={styles.statusBadge} style={d.has_summary ? { color: '#2E9E58', background: '#E4F5EA' } : { color: '#B87F1E', background: '#FFF2E0' }}>
                      {d.has_summary ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                ))}
                {documents.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No documents yet.</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className={styles.primaryChip} style={{ opacity: aiLoading ? 0.7 : 1 }} onClick={() => !aiLoading && generateSummary()}>
                <Icon name="sparkles" size={15} color="#FFFFFF" /> {aiLoading ? 'Generating…' : aiSummary ? 'Regenerate AI Summary' : 'Generate AI Summary'}
              </div>
              {canUploadDocs && (
                <div className={styles.ghostChip} onClick={() => { setUploadFormOpen(true); documentsRef.current?.scrollIntoView({ behavior: 'smooth' }) }}><Icon name="file-text" size={15} /> Upload Docs</div>
              )}
              {canManage && (
                <div className={styles.ghostChip} onClick={() => meetingsRef.current?.scrollIntoView({ behavior: 'smooth' })}><Icon name="calendar" size={15} /> Schedule Hearing</div>
              )}
              {canManage && caseInfo.status !== 'Closed' && (
                <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#B05C5C', cursor: 'pointer' }} onClick={closeCase}>Close Case</div>
              )}
            </div>
          </div>

          <div className={styles.sideCol}>
            {canMessage && caseInfo.client && (
              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Client</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: PRIMARY, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {initialsOf(caseInfo.client)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>{caseInfo.client}</div>
                    <div style={{ fontSize: 11.5, color: MUTED }}>Client</div>
                  </div>
                </div>
                {(caseInfo.client_email || caseInfo.client_phone) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, fontSize: 12.5, color: '#6A5C42' }}>
                    {caseInfo.client_email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="mail" size={14} color="#93826d" />{caseInfo.client_email}</div>}
                    {caseInfo.client_phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="phone" size={14} color="#93826d" />{caseInfo.client_phone}</div>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <div
                    className={styles.primaryChip}
                    style={{ flex: 1, justifyContent: 'center', opacity: messaging || !caseInfo.client_id ? 0.6 : 1, cursor: messaging || !caseInfo.client_id ? 'default' : 'pointer' }}
                    onClick={() => !messaging && messageClient()}
                  >
                    <Icon name="message-circle" size={15} color="#FFFFFF" /> {messaging ? 'Opening…' : 'Message'}
                  </div>
                  {caseInfo.client_phone && (
                    <a href={`tel:${caseInfo.client_phone}`} className={styles.ghostChip} style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}>
                      <Icon name="phone" size={15} color={MUTED} /> Call
                    </a>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className={styles.panelTitle}>Case Notes & Legal Observations</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1.5px solid #E7DCC6', borderRadius: 9, padding: '9px 12px', marginBottom: 10 }}>
                <Icon name="search" size={15} color="#A38F66" />
                <input
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  placeholder="Search notes…"
                  style={{ border: 'none', outline: 'none', fontSize: 13.5, background: 'transparent', flex: 1, fontFamily: 'inherit' }}
                />
              </div>
              {canAddNote && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Quick note… press Enter"
                      style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={(e) => e.key === 'Enter' && submitNote()}
                    />
                    <div className={styles.primaryChip} style={{ opacity: addingNote ? 0.7 : 1 }} onClick={submitNote}>{addingNote ? '…' : '+'}</div>
                  </div>
                  {noteForm === null ? (
                    <div className={styles.primaryChip} style={{ justifyContent: 'center', marginBottom: 14 }} onClick={() => setNoteForm(BLANK_FORM)}>
                      <Icon name="plus" size={15} color="#FFFFFF" /> Add New Note
                    </div>
                  ) : (
                    <div style={{ border: '1.5px solid #E7DCC6', borderRadius: 10, padding: 12, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} placeholder="Title (optional)" style={inputStyle} />
                      <textarea value={noteForm.note} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })} placeholder="Note content…" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {noteForm.checklist.map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span>• {item.text}</span>
                            <span style={{ marginLeft: 'auto', color: '#B05C5C', cursor: 'pointer', fontSize: 12 }} onClick={() => setNoteForm({ ...noteForm, checklist: noteForm.checklist.filter((_, j) => j !== i) })}>remove</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            value={checklistDraft}
                            onChange={(e) => setChecklistDraft(e.target.value)}
                            placeholder="Checklist item…"
                            style={{ ...inputStyle, flex: 1 }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistDraftItem())}
                          />
                          <div className={styles.ghostChip} onClick={addChecklistDraftItem}>+ item</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div className={styles.primaryChip} style={{ opacity: savingNote ? 0.7 : 1 }} onClick={saveNoteForm}>{savingNote ? 'Saving…' : 'Save'}</div>
                        <div className={styles.ghostChip} onClick={() => { setNoteForm(null); setChecklistDraft('') }}>Cancel</div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredNotes.map((n) => (
                  <div key={n.id} style={{ padding: '10px 14px', border: '1px solid #E7DCC6', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2118', flex: 1 }}>{n.title ?? 'Note'}</div>
                      {canAddNote && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ cursor: 'pointer', display: 'flex' }} onClick={() => togglePin(n)} title="Pin">
                            <Icon name="star" size={14} color={n.pinned ? PRIMARY : '#C9BC9E'} />
                          </span>
                          <span style={{ cursor: 'pointer', display: 'flex' }} onClick={() => setNoteForm({ id: n.id, title: n.title ?? '', note: n.note, checklist: n.checklist ?? [] })} title="Edit">
                            <Icon name="edit" size={14} color={MUTED} />
                          </span>
                          <span style={{ cursor: 'pointer', display: 'flex' }} onClick={() => removeNote(n.id)} title="Delete">
                            <Icon name="trash-2" size={14} color="#B05C5C" />
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13.5, color: '#2A2118', marginTop: 4 }}>{n.note}</div>
                    {n.checklist && n.checklist.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                        {n.checklist.map((item, i) => (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: item.checked ? MUTED : '#2A2118', textDecoration: item.checked ? 'line-through' : 'none', cursor: canAddNote ? 'pointer' : 'default' }}>
                            <input type="checkbox" checked={item.checked} disabled={!canAddNote} onChange={() => toggleChecklistItem(n, i)} />
                            {item.text}
                          </label>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{n.lawyer_name ?? 'Lawyer'} · {formatDate(n.created_at)}</div>
                  </div>
                ))}
                {filteredNotes.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No notes yet.</div>}
              </div>
            </div>
          </div>
          </div>
        </div>

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          documentId={previewDoc.id}
          fileName={previewDoc.file_name}
          mimeType={previewDoc.mime_type}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  )
}
