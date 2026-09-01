/** `/cases/:caseId` route: full case detail with notes, timeline, meetings, and documents (preview via `DocumentPreviewModal`). Role controls which actions (status change, unassign, add note, upload) are shown. */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listCases, listCaseNotes, addCaseNote, listCaseTimeline, changeCaseStatus, listDocuments,
  listMeetings, createMeeting, listDocumentTypes, uploadDocument, getDocumentDownloadUrl, unassignLawyer,
} from '../../api/client'
import type { CaseSummary, NoteSummary, TimelineEvent, DocumentSummary, MeetingSummary, DocumentTypeOption, UserProfile } from '../../types/api'
import { formatDate as formatDateWith } from '../../utils/date'
import DocumentPreviewModal, { isPreviewable } from '../../components/DocumentPreviewModal'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const PRIMARY = '#B08D3E'
const MUTED = '#8C7C5E'

const ADMIN = 1
const LAWYER = 2
const CLIENT = 3

const STATUS_OPTIONS = ['Open', 'In Progress', 'Pending', 'Completed', 'Closed']
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Completed: ['#2E9E58', '#E4F5EA'],
  Closed: ['#2E9E58', '#E4F5EA'],
  Open: ['#B87F1E', '#FFF2E0'],
  'In Progress': ['#B87F1E', '#FFF2E0'],
  Pending: ['#B87F1E', '#FFF2E0'],
}
const PRIORITY_COLORS: Record<string, string> = { High: '#B05C5C', Medium: '#B87F1E', Low: '#2E9E58' }

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function formatDate(iso: string) {
  return formatDateWith(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Loads all cases via `listCases()` and finds this one by `caseId` (there's
 * no single-case GET endpoint), plus notes/timeline/documents/meetings in
 * parallel. Wires up note-adding, status change, lawyer unassign, meeting
 * scheduling, and document upload/preview/download handlers below.
 */
export default function CaseDetailPage() {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const profile = loadProfile()
  const canManage = profile?.role_id === LAWYER || profile?.role_id === ADMIN
  const canAddNote = profile?.role_id === LAWYER
  const canUploadDocs = profile?.role_id === CLIENT

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
  const [statusSaving, setStatusSaving] = useState(false)
  const [unassigning, setUnassigning] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [meetingTitle, setMeetingTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [scheduling, setScheduling] = useState(false)

  const [uploadTypeId, setUploadTypeId] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

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

  async function scheduleMeeting() {
    if (!caseInfo?.lawyer_id || !meetingTitle.trim() || !meetingDate) return
    setScheduling(true)
    try {
      const created = await createMeeting({
        case_id: numericCaseId,
        conducted_by: caseInfo.lawyer_id,
        meeting_title: meetingTitle.trim(),
        meeting_date: meetingDate,
      })
      setMeetings((prev) => [created, ...prev])
      setMeetingTitle('')
      setMeetingDate('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to schedule meeting.')
    } finally {
      setScheduling(false)
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

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.ghostChip} style={{ width: 'fit-content' }} onClick={() => navigate(-1)}>← Back</div>

        <div className={styles.header}>
          <div>
            <div className={styles.title}>{caseInfo.id}</div>
            <div className={styles.subtitle}>{caseInfo.court ?? 'No court assigned'}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className={styles.statusBadge} style={{ color: statusColor, background: statusBg }}>{caseInfo.status}</span>
            <span className={styles.statusBadge} style={{ color: PRIORITY_COLORS[caseInfo.priority] ?? '#6A5C42', background: '#EFEAE1' }}>{caseInfo.priority} priority</span>
          </div>
        </div>

        <div className={styles.statCards}>
          <div className={styles.statCard} style={{ gap: 4 }}>
            <div className={styles.statLabel}>Client</div>
            <div className={styles.statValue} style={{ fontSize: 16 }}>{caseInfo.client ?? '—'}</div>
          </div>
          <div className={styles.statCard} style={{ gap: 4 }}>
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
          <div className={styles.statCard} style={{ gap: 4 }}>
            <div className={styles.statLabel}>Next Hearing</div>
            <div className={styles.statValue} style={{ fontSize: 16 }}>{caseInfo.hearing ?? '—'}</div>
          </div>
          {canManage && (
            <div className={styles.statCard} style={{ gap: 8 }}>
              <div className={styles.statLabel}>Change Status</div>
              <select
                value={caseInfo.status}
                disabled={statusSaving}
                onChange={(e) => updateStatus(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E7DCC6', fontSize: 13, background: '#FFFFFF' }}
              >
                {[caseInfo.status, ...STATUS_OPTIONS.filter((s) => s !== caseInfo.status)].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className={styles.midGrid}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Case Notes</div>
              {canAddNote && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note for this case…"
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }}
                    onKeyDown={(e) => e.key === 'Enter' && submitNote()}
                  />
                  <div className={styles.primaryChip} style={{ opacity: addingNote ? 0.7 : 1 }} onClick={submitNote}>{addingNote ? 'Adding…' : 'Add'}</div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {notes.map((n) => (
                  <div key={n.id} style={{ padding: '10px 14px', border: '1px solid #E7DCC6', borderRadius: 10 }}>
                    <div style={{ fontSize: 13.5, color: '#2A2118' }}>{n.note}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 5 }}>{n.lawyer_name ?? 'Lawyer'} · {formatDate(n.created_at)}</div>
                  </div>
                ))}
                {notes.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No notes yet.</div>}
              </div>
            </div>

            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Timeline</div>
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

            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Meetings</div>
              {canManage && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  <input
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    placeholder="Meeting title"
                    style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="datetime-local"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }}
                    />
                    <div className={styles.primaryChip} style={{ opacity: scheduling ? 0.7 : 1 }} onClick={scheduleMeeting}>{scheduling ? 'Scheduling…' : 'Schedule'}</div>
                  </div>
                  {!caseInfo.lawyer_id && <div style={{ fontSize: 12, color: '#B05C5C' }}>No lawyer assigned to this case yet — can't schedule.</div>}
                </div>
              )}
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
          </div>

          <div className={styles.sideCol}>
            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Documents</div>
              {canUploadDocs && (
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
                  <div className={styles.primaryChip} style={{ opacity: uploading || !uploadFile || !uploadTypeId ? 0.6 : 1, justifyContent: 'center' }} onClick={submitUpload}>
                    {uploading ? 'Uploading…' : 'Upload'}
                  </div>
                </div>
              )}
              <div className={styles.quickActionsList}>
                {documents.map((d) => (
                  <div key={d.id} className={styles.quickAction} onClick={() => openDocument(d)}>
                    <span>{d.file_name}</span>
                  </div>
                ))}
                {documents.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No documents yet.</div>}
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
