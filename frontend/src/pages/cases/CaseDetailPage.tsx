/** `/cases/:caseId` route: full case detail with an AI-generated case summary, notes (with
 * optional checklists), timeline, meetings, and documents (preview via `DocumentPreviewModal`).
 * Role controls which actions (status change, unassign, add/edit note, upload) are shown. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listCases, listCaseNotes, addCaseNote, updateCaseNote, deleteCaseNote, listCaseTimeline, changeCaseStatus,
  listDocuments, listMeetings, listDocumentTypes, uploadDocument, getDocumentDownloadUrl,
  unassignLawyer, getCaseAiSummary, generateCaseAiSummary, listSimilarOwnCases, getOrCreateConversation, createMeeting,
  listHearings, createHearing, listJudges, updateHearing, updateMeeting, deleteDocument,
} from '../../api/client'
import type {
  CaseSummary, NoteSummary, ChecklistItem, TimelineEvent, DocumentSummary, MeetingSummary,
  DocumentTypeOption, UserProfile, CaseAiSummary, CaseSearchResult, HearingSummary, JudgeOption,
} from '../../types/api'
import { formatDate as formatDateWith } from '../../utils/date'
import DocumentPreviewModal, { isPreviewable } from '../../components/DocumentPreviewModal'
import SimilarCaseModal from '../../components/SimilarCaseModal'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'
import cd from './cases.module.css'
import { Dropdown } from '../conveyancing/ConveyancingDashboardPage'

const PRIMARY = '#23306B'
const MUTED = '#6E6759'

const ADMIN = 1
const LAWYER = 2
const CLIENT = 3

const STATUS_OPTIONS = ['Open', 'In Progress', 'Pending', 'Completed', 'Closed']
const STATUS_LABELS: Record<string, string> = { Open: 'Active' }
function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s
}
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Completed: ['#4A6B4E', '#E4EDE5'],
  Closed: ['#4A6B4E', '#E4EDE5'],
  Open: ['#8A6A2F', '#F3EBD9'],
  'In Progress': ['#8A6A2F', '#F3EBD9'],
  Pending: ['#8A6A2F', '#F3EBD9'],
}
const PRIORITY_COLORS: Record<string, string> = { High: '#B3282D', Medium: '#8A6A2F', Low: '#4A6B4E' }

const inputStyle = { padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5 }

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
const HEARING_STATUSES = ['Scheduled', 'Completed', 'Adjourned', 'Cancelled']
const MEETING_STATUSES = ['Scheduled', 'Completed', 'Cancelled']

/** One cell of the record header's facts strip. */
export function Fact({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className={cd.fact}>
      <div className={cd.factLabel}>{label}</div>
      <div className={cd.factValue}>{value}</div>
      {children}
    </div>
  )
}

/** Titled section card: an optional count pill and a right-aligned action sit in the head. */
export function Card({ title, count, action, innerRef, children }: {
  title: string
  count?: number
  action?: React.ReactNode
  innerRef?: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}) {
  return (
    <div className={cd.card} ref={innerRef}>
      <div className={cd.cardHead}>
        <span className={cd.cardTitle}>{title}</span>
        {count != null && count > 0 && <span className={cd.count}>{count}</span>}
        {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
      </div>
      <div className={cd.cardBody}>{children}</div>
    </div>
  )
}

/** Empty section: says what belongs here, and offers the action that fills it. */
export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className={cd.empty}>{children}</div>
      {action && <div className={cd.emptyRow}>{action}</div>}
    </div>
  )
}

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
  const [openPrecedent, setOpenPrecedent] = useState<string | null>(null)
  const [similarCases, setSimilarCases] = useState<CaseSearchResult[] | null>(null)
  const [similarLoading, setSimilarLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  const [statusSaving, setStatusSaving] = useState(false)
  const [unassigning, setUnassigning] = useState(false)
  const [messaging, setMessaging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const meetingsRef = useRef<HTMLDivElement>(null)
  const documentsRef = useRef<HTMLDivElement>(null)

  const [hearingOpen, setHearingOpen] = useState(false)
  const [scheduleKind, setScheduleKind] = useState<'hearing' | 'meeting'>('hearing')
  const [schedulingHearing, setSchedulingHearing] = useState(false)
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [judges, setJudges] = useState<JudgeOption[]>([])
  const [hearingJudgeId, setHearingJudgeId] = useState('')
  const [hearingDate, setHearingDate] = useState('')
  const [hearingTime, setHearingTime] = useState('')
  const [hearingCourtroom, setHearingCourtroom] = useState('')
  const [hearingNotes, setHearingNotes] = useState('')
  // Set when the backend refuses the hearing as a possible double-submit; the form then
  // offers to send it again saying the repeat listing is deliberate.
  const [duplicateHearing, setDuplicateHearing] = useState('')
  // the row whose outcome is being recorded, and the draft for it
  const [outcomeFor, setOutcomeFor] = useState<{ kind: 'hearing' | 'meeting'; id: number } | null>(null)
  const [outcomeStatus, setOutcomeStatus] = useState('')
  const [outcomeText, setOutcomeText] = useState('')
  const [outcomeNext, setOutcomeNext] = useState('')
  const [savingOutcome, setSavingOutcome] = useState(false)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<number | null>(null)
  const [meetingTitle, setMeetingTitle] = useState('')
  const [meetingWhen, setMeetingWhen] = useState('')
  const [meetingAgenda, setMeetingAgenda] = useState('')

  const [uploadTypeId, setUploadTypeId] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [uploadDragOver, setUploadDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFormOpen, setUploadFormOpen] = useState(false)

  const numericCaseId = Number(caseId)

  useEffect(() => {
    if (!numericCaseId) { setError('Invalid case.'); setLoading(false); return }
    // React Router keeps this component mounted when one case links to another, so anything
    // scoped to a single case has to be cleared by hand or it is read as the new case's.
    setSimilarCases(null)
    setOpenPrecedent(null)
    Promise.all([listCases(), canManage ? listCaseNotes(numericCaseId) : Promise.resolve([]), listCaseTimeline(numericCaseId), listDocuments(), listMeetings(numericCaseId), listHearings()])
      .then(([cases, n, t, docs, m, h]) => {
        const found = cases.find((c) => c.case_id === numericCaseId)
        if (!found) { setError("This case doesn't exist or you don't have access to it."); return }
        setCaseInfo(found)
        setNotes(n)
        setTimeline(t)
        setDocuments(docs.filter((d) => d.case_number === found.id))
        setMeetings(m)
        setHearings(h.filter((x) => x.case_id === numericCaseId).sort((a, b) => a.hearing_date.localeCompare(b.hearing_date)))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this case.'))
      .finally(() => setLoading(false))
    if (canUploadDocs) listDocumentTypes().then(setDocumentTypes).catch(() => {})
    if (canManage) listJudges().then(setJudges).catch(() => {})
    if (canManage) getCaseAiSummary(numericCaseId).then(setAiSummary).catch(() => setAiSummary(null))
  }, [numericCaseId, canUploadDocs, canManage])

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

  /** Ranks the firm's other cases against this one via `/cases/:id/similar` -- the lawyer's own
   * files, scoped the way the case list is, not the public judgement corpus. */
  async function findSimilarCases() {
    setSimilarLoading(true)
    try {
      setSimilarCases(await listSimilarOwnCases(numericCaseId))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to find similar cases.')
    } finally {
      setSimilarLoading(false)
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

  async function openConversation(userId: number | null) {
    if (!userId) return
    setMessaging(true)
    try {
      const conversation = await getOrCreateConversation(userId)
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

  function openOutcomeForm(kind: 'hearing' | 'meeting', id: number, status: string, text: string) {
    setOutcomeFor({ kind, id })
    setOutcomeStatus(status)
    setOutcomeText(text)
    setOutcomeNext('')
  }

  /** Writes back what actually happened -- a hearing's outcome or a meeting's discussion. Both
   * are read by the AI case brief, and until now neither could be recorded anywhere in the app. */
  async function saveOutcome() {
    if (!outcomeFor) return
    setSavingOutcome(true)
    try {
      if (outcomeFor.kind === 'hearing') {
        const updated = await updateHearing(outcomeFor.id, {
          hearing_status: outcomeStatus || undefined,
          hearing_outcome: outcomeText.trim() || undefined,
          next_hearing_date: outcomeNext || undefined,
        })
        setHearings((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
      } else {
        const updated = await updateMeeting(outcomeFor.id, {
          meeting_status: outcomeStatus || undefined,
          discussion_summary: outcomeText.trim() || undefined,
          next_meeting_date: outcomeNext || undefined,
        })
        setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      }
      setOutcomeFor(null)
      showToast('Outcome recorded.')
      listCaseTimeline(numericCaseId).then(setTimeline).catch(() => {})
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record the outcome.')
    } finally {
      setSavingOutcome(false)
    }
  }

  async function removeDocument(documentId: number) {
    try {
      await deleteDocument(documentId)
      setDocuments((prev) => prev.filter((d) => d.id !== documentId))
      setConfirmDeleteDoc(null)
      showToast('Document deleted.')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete the document.')
    }
  }

  function closeScheduleForm() {
    setHearingOpen(false)
    setDuplicateHearing('')
    setHearingJudgeId('')
    setHearingDate('')
    setHearingTime('')
    setHearingCourtroom('')
    setHearingNotes('')
    setMeetingTitle('')
    setMeetingWhen('')
    setMeetingAgenda('')
  }

  /** Books a real court hearing (`POST /hearings`). The backend refuses a hearing identical to
   * one already on the case, in case a submit landed twice -- `allowDuplicate` re-sends it to
   * say the repeat listing is meant. */
  async function submitHearing(allowDuplicate = false) {
    if (!hearingJudgeId || !hearingDate) return
    setSchedulingHearing(true)
    setDuplicateHearing('')
    try {
      const created = await createHearing({
        case_id: numericCaseId,
        judge_id: Number(hearingJudgeId),
        hearing_date: hearingDate,
        hearing_time: hearingTime || undefined,
        courtroom: hearingCourtroom.trim() || undefined,
        notes: hearingNotes.trim() || undefined,
        allow_duplicate: allowDuplicate || undefined,
      })
      setHearings((prev) => [...prev, created].sort((a, b) => a.hearing_date.localeCompare(b.hearing_date)))
      closeScheduleForm()
      showToast('Hearing scheduled.')
      listCases().then((cases) => {
        const found = cases.find((c) => c.case_id === numericCaseId)
        if (found) setCaseInfo(found)
      }).catch(() => {})
      listCaseTimeline(numericCaseId).then(setTimeline).catch(() => {})
    } catch (err) {
      const status = (err as { status?: number }).status
      // the 409 detail names the API flag, which means nothing to a lawyer -- the button
      // beside this message is how they say the repeat listing is deliberate
      if (status === 409) setDuplicateHearing('This case already has a hearing at that date and time before that judge.')
      else showToast(err instanceof Error ? err.message : 'Failed to schedule the hearing.')
    } finally {
      setSchedulingHearing(false)
    }
  }

  async function submitMeeting() {
    if (!meetingTitle.trim() || !meetingWhen) return
    setSchedulingHearing(true)
    try {
      const created = await createMeeting({
        case_id: numericCaseId,
        meeting_title: meetingTitle.trim(),
        meeting_date: new Date(meetingWhen).toISOString(),
        agenda: meetingAgenda.trim() || undefined,
      })
      setMeetings((prev) => [...prev, created])
      closeScheduleForm()
      showToast('Meeting scheduled.')
      listCaseTimeline(numericCaseId).then(setTimeline).catch(() => {})
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to schedule the meeting.')
    } finally {
      setSchedulingHearing(false)
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
        <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>
        <div className={styles.ghostChip} style={{ width: 'fit-content' }} onClick={() => navigate('/cases')}>Back to cases</div>
      </div>
    </div>
  )

  const [statusColor, statusBg] = STATUS_STYLE_MAP[caseInfo.status] || ['#575145', '#F0ECDF']
  const filteredNotes = notes
    .filter((n) => !noteSearch.trim() || `${n.title ?? ''} ${n.note}`.toLowerCase().includes(noteSearch.trim().toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))

  const hasSideColumn = canManage || (canMessage && !!caseInfo.client)

  function openHearingForm() {
    setHearingOpen(true)
    setScheduleKind('hearing')
    meetingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function openUploadForm() {
    setUploadFormOpen(true)
    documentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.breadcrumb}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/cases')}>Cases</span>
          <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><Icon name="chevron-down" size={13} color="#8C857A" /></span>
          <span>{caseInfo.id}</span>
        </div>

        <div className={cd.record}>
          <div className={cd.recordTop}>
            <div style={{ minWidth: 0 }}>
              <div className={cd.caseNumber}>{caseInfo.id}</div>
              <h1 className={cd.caseTitle}>{caseInfo.case_title ?? caseInfo.court ?? 'Untitled case'}</h1>
              <div className={cd.badges}>
                <span className={styles.statusBadge} style={{ color: statusColor, background: statusBg }}>{statusLabel(caseInfo.status)}</span>
                <span className={styles.statusBadge} style={{ color: PRIORITY_COLORS[caseInfo.priority] ?? '#575145', background: '#F0ECDF' }}>{caseInfo.priority} priority</span>
              </div>
            </div>

            <div className={cd.actions}>
              {canManage && (
                <Dropdown value={caseInfo.status} options={STATUS_OPTIONS} labelFor={statusLabel} onChange={(st) => !statusSaving && updateStatus(st)} />
              )}
              {canUploadDocs && (
                <div className={styles.ghostChip} onClick={openUploadForm}><Icon name="file-text" size={15} color={MUTED} /> Upload document</div>
              )}
              {canManage && (
                <div className={styles.ghostChip} onClick={openHearingForm}><Icon name="calendar" size={15} color={MUTED} /> Schedule hearing</div>
              )}
            </div>
          </div>

          <div className={cd.facts}>
            <Fact label="Client" value={caseInfo.client ?? 'Not recorded'} />
            <Fact label="Case type" value={caseInfo.case_type ?? 'Not set'} />
            <Fact label="Next hearing" value={caseInfo.hearing ? formatDay(caseInfo.hearing) : 'Not scheduled'}>
              {caseInfo.hearing && (
                <button className={cd.linkAction} style={{ fontSize: 11.5, marginTop: 4 }} onClick={() => navigate('/hearings')}>View in calendar</button>
              )}
            </Fact>
            <Fact label="Responsible lawyer" value={caseInfo.lawyer ?? 'Not assigned'}>
              {canManage && caseInfo.lawyer && (
                <div className={cd.factAction} onClick={() => !unassigning && unassign()}>{unassigning ? 'Removing…' : 'Unassign'}</div>
              )}
              {!canManage && caseInfo.lawyer_id && (
                <button className={cd.linkAction} style={{ fontSize: 11.5, marginTop: 4 }} onClick={() => !messaging && openConversation(caseInfo.lawyer_id)}>{messaging ? 'Opening…' : 'Message'}</button>
              )}
            </Fact>
          </div>
        </div>

        <div className={`${cd.columns} ${hasSideColumn ? '' : cd.columnsSolo}`}>
          <div className={cd.col}>
            {canManage && (
            <div className={cd.aiCard}>
              <div className={cd.aiHead}>
                <Icon name="sparkles" size={15} color={PRIMARY} /> AI summary
                {aiSummary && (
                  <button className={cd.linkAction} style={{ marginLeft: 'auto' }} onClick={() => !aiLoading && generateSummary()}>
                    {aiLoading ? 'Summarising…' : 'Update'}
                  </button>
                )}
              </div>
              {aiSummary ? (
                <>
                  <div className={cd.aiBody}>{aiSummary.summary_text}</div>
                  {aiSummary.related_cases.length > 0 && (
                    <div className={cd.aiMeta} style={{ fontSize: 12.5 }}>
                      Reads like {aiSummary.related_cases.length} reported judgement{aiSummary.related_cases.length > 1 ? 's' : ''}:{' '}
                      {aiSummary.related_cases.map((r, i) => (
                        <span key={r.doc_id}>
                          {i > 0 && ', '}
                          <button className={cd.linkAction} onClick={() => setOpenPrecedent(r.doc_id)} title="Read this judgement">
                            {r.doc_id} ({Math.round(r.score * 100)}%)
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={cd.aiMeta}>Generated {formatDate(aiSummary.generated_at)}</div>
                </>
              ) : (
                <Empty
                  action={
                    <div className={styles.primaryChip} style={{ opacity: aiLoading ? 0.7 : 1 }} onClick={() => !aiLoading && generateSummary()}>
                      <Icon name="sparkles" size={15} color="#FCFAF4" /> {aiLoading ? 'Summarising…' : 'Generate summary'}
                    </div>
                  }
                >
                  Nothing summarised yet. LexFlow reads this case's notes, documents and timeline to draft a brief, and points out earlier judgements that resemble it.
                </Empty>
              )}
            </div>
            )}

            {canManage && (
              <Card
                title="Similar cases"
                count={similarCases?.length}
                action={
                  similarCases && (
                    <button className={cd.linkAction} onClick={() => !similarLoading && findSimilarCases()}>
                      {similarLoading ? 'Searching…' : 'Refresh'}
                    </button>
                  )
                }
              >
                {similarCases === null ? (
                  <Empty
                    action={
                      <div className={styles.ghostChip} style={{ opacity: similarLoading ? 0.7 : 1 }} onClick={() => !similarLoading && findSimilarCases()}>
                        <Icon name="search" size={15} color="#575145" /> {similarLoading ? 'Searching…' : 'Find similar cases'}
                      </div>
                    }
                  >
                    Match this case against the others on your desk -- LexFlow reads each one's notes and documents to find the ones you've handled like it before.
                  </Empty>
                ) : similarCases.length === 0 ? (
                  <Empty>No other case of yours reads like this one yet.</Empty>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {similarCases.map((c) => (
                      <div key={c.case_id} className={`${cd.listRow} ${cd.listRowLink}`} onClick={() => navigate(`/cases/${c.case_id}`)}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div className={cd.caseNumber}>{c.case_number ?? '—'}</div>
                            <div className={cd.rowTitle} style={{ marginTop: 2 }}>{c.case_title ?? 'Untitled case'}</div>
                          </div>
                          <span className={styles.statusBadge} style={{ color: '#575145', background: '#F0ECDF', flexShrink: 0 }}>{Math.round(c.score * 100)}% match</span>
                        </div>
                        {c.excerpt && <div className={cd.metaRow} style={{ display: 'block', lineHeight: 1.5 }}>{c.excerpt}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card title="Timeline" count={timeline.length}>
              {timeline.length > 0 ? (
                <div className={styles.timeline}>
                  {timeline.map((t) => (
                    <div key={t.id} className={styles.timelineItem}>
                      <span className={styles.timelineDot} style={{ background: PRIMARY }} />
                      <div className={cd.rowTitle}>{t.event_title}</div>
                      {t.event_description && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>{t.event_description}</div>}
                      <div className={cd.metaRow}>
                        <span>{formatDate(t.created_at)}</span>
                        {t.created_by && <span>{t.created_by}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>Nothing has happened on this case yet. Status changes, uploads and scheduled hearings all land here.</Empty>
              )}
            </Card>

            <Card
              title="Hearings & meetings"
              count={hearings.length + meetings.length}
              innerRef={meetingsRef}
              action={canManage && !hearingOpen && (hearings.length + meetings.length) > 0 ? <button className={cd.linkAction} onClick={() => setHearingOpen(true)}>Schedule</button> : undefined}
            >
              {canManage && hearingOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['hearing', 'meeting'] as const).map((kind) => (
                      <button
                        key={kind}
                        className={styles.ghostChip}
                        style={{ padding: '5px 12px', fontSize: 12, background: scheduleKind === kind ? '#E6E0CE' : '#FCFAF4' }}
                        onClick={() => { setScheduleKind(kind); setDuplicateHearing('') }}
                      >
                        {kind === 'hearing' ? 'Court hearing' : 'Internal meeting'}
                      </button>
                    ))}
                  </div>

                  {scheduleKind === 'hearing' ? (
                    <>
                      <select value={hearingJudgeId} onChange={(e) => { setHearingJudgeId(e.target.value); setDuplicateHearing('') }} style={inputStyle}>
                        <option value="">Select a judge…</option>
                        {judges.map((j) => (
                          <option key={j.judge_id} value={j.judge_id}>{j.judge_name}{j.court_name ? ` — ${j.court_name}` : ''}</option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="date" value={hearingDate} onChange={(e) => { setHearingDate(e.target.value); setDuplicateHearing('') }} style={{ ...inputStyle, flex: 1 }} />
                        <input type="time" value={hearingTime} onChange={(e) => { setHearingTime(e.target.value); setDuplicateHearing('') }} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <input value={hearingCourtroom} onChange={(e) => setHearingCourtroom(e.target.value)} placeholder="Courtroom (optional)" style={inputStyle} />
                      <textarea value={hearingNotes} onChange={(e) => setHearingNotes(e.target.value)} placeholder="Notes (optional)" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                      {duplicateHearing && (
                        <div style={{ fontSize: 12.5, color: '#8A6A2F', background: '#F3EBD9', borderRadius: 3, padding: '8px 10px', lineHeight: 1.5 }}>
                          {duplicateHearing}
                          <button className={cd.linkAction} style={{ marginLeft: 8 }} onClick={() => !schedulingHearing && submitHearing(true)}>
                            Schedule it anyway
                          </button>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div
                          className={styles.primaryChip}
                          style={{ opacity: schedulingHearing || !hearingJudgeId || !hearingDate ? 0.6 : 1 }}
                          onClick={() => !schedulingHearing && submitHearing()}
                        >
                          {schedulingHearing ? 'Scheduling…' : 'Schedule hearing'}
                        </div>
                        <div className={styles.ghostChip} onClick={closeScheduleForm}>Cancel</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} placeholder="What is this meeting for?" style={inputStyle} />
                      <input type="datetime-local" value={meetingWhen} onChange={(e) => setMeetingWhen(e.target.value)} style={inputStyle} />
                      <textarea value={meetingAgenda} onChange={(e) => setMeetingAgenda(e.target.value)} placeholder="Agenda (optional)" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div
                          className={styles.primaryChip}
                          style={{ opacity: schedulingHearing || !meetingTitle.trim() || !meetingWhen ? 0.6 : 1 }}
                          onClick={() => !schedulingHearing && submitMeeting()}
                        >
                          {schedulingHearing ? 'Scheduling…' : 'Schedule meeting'}
                        </div>
                        <div className={styles.ghostChip} onClick={closeScheduleForm}>Cancel</div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {hearings.length + meetings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {hearings.map((h) => (
                    <div key={`h${h.id}`} className={cd.listRow}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        {/* hearing_date is a plain date, not a timestamp -- formatDate would
                            render it as local midnight and show a bogus time beside the real one */}
                        <div className={cd.rowTitle}>{formatDay(h.hearing_date)}{h.hearing_time ? ` · ${h.hearing_time.slice(0, 5)}` : ''}</div>
                        <span className={styles.statusBadge} style={{ color: '#575145', background: '#F0ECDF', flexShrink: 0 }}>{h.hearing_status}</span>
                      </div>
                      <div className={cd.metaRow}>
                        <span>{h.judge_name ?? 'Judge not set'}</span>
                        {h.courtroom && <span>{h.courtroom}</span>}
                        {h.hearing_outcome && <span>{h.hearing_outcome}</span>}
                      </div>
                      {h.notes && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{h.notes}</div>}
                      {canManage && outcomeFor?.id !== h.id && (
                        <button className={cd.linkAction} style={{ marginTop: 6 }} onClick={() => openOutcomeForm('hearing', h.id, h.hearing_status, h.hearing_outcome ?? '')}>
                          Record outcome
                        </button>
                      )}
                      {outcomeFor?.kind === 'hearing' && outcomeFor.id === h.id && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, borderTop: '1px solid #F1EDE0', paddingTop: 10 }}>
                          <select value={outcomeStatus} onChange={(e) => setOutcomeStatus(e.target.value)} style={inputStyle}>
                            {HEARING_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                          </select>
                          <input value={outcomeText} onChange={(e) => setOutcomeText(e.target.value)} placeholder={"What was the outcome?"} style={inputStyle} />
                          <input type="date" value={outcomeNext} onChange={(e) => setOutcomeNext(e.target.value)} title={"Next hearing date"} style={inputStyle} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div className={styles.primaryChip} style={{ opacity: savingOutcome ? 0.6 : 1 }} onClick={() => !savingOutcome && saveOutcome()}>
                              {savingOutcome ? 'Saving…' : 'Save'}
                            </div>
                            <div className={styles.ghostChip} onClick={() => setOutcomeFor(null)}>Cancel</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {meetings.map((m) => (
                    <div key={`m${m.id}`} className={cd.listRow}>
                      <div className={cd.rowTitle}>{m.meeting_title ?? 'Meeting'}</div>
                      <div className={cd.metaRow}>
                        <span>{formatDate(m.meeting_date)}</span>
                        <span>{m.meeting_status}</span>
                        {m.conducted_by && <span>{m.conducted_by}</span>}
                      </div>
                      {m.discussion_summary && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{m.discussion_summary}</div>}
                      {canManage && outcomeFor?.id !== m.id && (
                        <button className={cd.linkAction} style={{ marginTop: 6 }} onClick={() => openOutcomeForm('meeting', m.id, m.meeting_status, m.discussion_summary ?? '')}>
                          Record outcome
                        </button>
                      )}
                      {outcomeFor?.kind === 'meeting' && outcomeFor.id === m.id && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, borderTop: '1px solid #F1EDE0', paddingTop: 10 }}>
                          <select value={outcomeStatus} onChange={(e) => setOutcomeStatus(e.target.value)} style={inputStyle}>
                            {MEETING_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                          </select>
                          <input value={outcomeText} onChange={(e) => setOutcomeText(e.target.value)} placeholder={"What was discussed?"} style={inputStyle} />
                          <input type="date" value={outcomeNext} onChange={(e) => setOutcomeNext(e.target.value)} title={"Next meeting date"} style={inputStyle} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div className={styles.primaryChip} style={{ opacity: savingOutcome ? 0.6 : 1 }} onClick={() => !savingOutcome && saveOutcome()}>
                              {savingOutcome ? 'Saving…' : 'Save'}
                            </div>
                            <div className={styles.ghostChip} onClick={() => setOutcomeFor(null)}>Cancel</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : !hearingOpen && (
                <Empty action={canManage ? <div className={styles.ghostChip} onClick={() => setHearingOpen(true)}><Icon name="calendar" size={15} color={MUTED} /> Schedule a hearing</div> : undefined}>
                  Nothing is on the calendar for this case.
                </Empty>
              )}
            </Card>

            <Card
              title="Documents"
              count={documents.length}
              innerRef={documentsRef}
              action={canUploadDocs && !uploadFormOpen && documents.length > 0 ? <button className={cd.linkAction} onClick={() => setUploadFormOpen(true)}>Upload</button> : undefined}
            >
              {canUploadDocs && uploadFormOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,image/*,video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { setUploadFile(e.target.files?.[0] ?? null); e.target.value = '' }}
                  />
                  {uploadFile ? (
                    <div className={cd.listRow} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="file-text" size={18} color={MUTED} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className={cd.rowTitle} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadFile.name}</div>
                        <div className={cd.metaRow}><span>{(uploadFile.size / 1024).toFixed(0)} KB</span></div>
                      </div>
                      <button className={cd.linkAction} onClick={() => uploadInputRef.current?.click()}>Replace</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => uploadInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true) }}
                      onDragLeave={() => setUploadDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setUploadDragOver(false); setUploadFile(e.dataTransfer.files[0] ?? null) }}
                      style={{
                        border: `2px dashed ${uploadDragOver ? PRIMARY : '#CFC6B0'}`, borderRadius: 3, padding: '28px 20px',
                        textAlign: 'center', cursor: 'pointer', background: uploadDragOver ? '#F6F2E9' : '#FCFAF4',
                      }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                        <Icon name="upload-cloud" size={19} color={PRIMARY} strokeWidth={1.8} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1A17' }}>Drop a file here, or click to browse</div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>PDF, Word, images, or video · filed against {caseInfo.id}</div>
                    </div>
                  )}
                  <Dropdown
                    value={uploadTypeId}
                    options={['', ...documentTypes.map((t) => String(t.document_type_id))]}
                    labelFor={(v) => documentTypes.find((t) => String(t.document_type_id) === v)?.type_name ?? 'Choose a document type…'}
                    onChange={setUploadTypeId}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div
                      className={styles.primaryChip}
                      style={{ opacity: uploading || !uploadFile || !uploadTypeId ? 0.6 : 1, cursor: uploading || !uploadFile || !uploadTypeId ? 'default' : 'pointer' }}
                      onClick={submitUpload}
                    >
                      {uploading ? 'Uploading…' : 'Upload'}
                    </div>
                    <div className={styles.ghostChip} onClick={() => { setUploadFormOpen(false); setUploadFile(null); setUploadTypeId('') }}>Cancel</div>
                  </div>
                </div>
              )}
              {documents.length > 0 ? (
                <div className={styles.quickActionsList}>
                  {documents.map((d) => (
                    <div key={d.id} className={styles.quickAction} onClick={() => openDocument(d)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <Icon name="file-text" size={18} color={MUTED} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
                          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400, marginTop: 2 }}>{formatDay(d.upload_date)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        <span className={styles.statusBadge} style={d.has_summary ? { color: '#4A6B4E', background: '#E4EDE5' } : { color: '#8A6A2F', background: '#F3EBD9' }}>
                          {d.has_summary ? 'Summarised' : 'Not summarised'}
                        </span>
                        {canUploadDocs && (
                          // two-step rather than a window.confirm: deleting a filing is worth a
                          // deliberate second click, and a modal dialog here blocks the page
                          confirmDeleteDoc === d.id ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                              <button className={cd.linkAction} style={{ color: '#B3282D' }} onClick={() => removeDocument(d.id)}>Delete</button>
                              <button className={cd.linkAction} onClick={() => setConfirmDeleteDoc(null)}>Keep</button>
                            </span>
                          ) : (
                            <button className={cd.iconBtn} onClick={() => setConfirmDeleteDoc(d.id)} title="Delete document" aria-label="Delete document">
                              <Icon name="trash-2" size={14} color="#B3282D" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : !uploadFormOpen && (
                <Empty action={canUploadDocs ? <div className={styles.ghostChip} onClick={() => setUploadFormOpen(true)}><Icon name="file-text" size={15} color={MUTED} /> Upload a document</div> : undefined}>
                  No documents filed against this case.
                </Empty>
              )}
            </Card>

            {canManage && caseInfo.status !== 'Closed' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span className={cd.dangerLink} onClick={closeCase}>Close case</span>
              </div>
            )}
          </div>

          <div className={cd.col}>
            {canMessage && caseInfo.client && (
              <Card title="Client">
                <div className={cd.clientRow}>
                  <div className={cd.avatar}>{initialsOf(caseInfo.client)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A17' }}>{caseInfo.client}</div>
                    <div style={{ fontSize: 11.5, color: MUTED }}>Client on this case</div>
                  </div>
                </div>
                {(caseInfo.client_email || caseInfo.client_phone) && (
                  <div className={cd.contactList}>
                    {caseInfo.client_email && <div className={cd.contactItem}><Icon name="mail" size={14} color="#8C857A" />{caseInfo.client_email}</div>}
                    {caseInfo.client_phone && <div className={cd.contactItem}><Icon name="phone" size={14} color="#8C857A" />{caseInfo.client_phone}</div>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <div
                    className={styles.primaryChip}
                    style={{ flex: 1, justifyContent: 'center', opacity: messaging || !caseInfo.client_id ? 0.6 : 1, cursor: messaging || !caseInfo.client_id ? 'default' : 'pointer' }}
                    onClick={() => !messaging && openConversation(caseInfo.client_id)}
                  >
                    <Icon name="message-circle" size={15} color="#FCFAF4" /> {messaging ? 'Opening…' : 'Message'}
                  </div>
                  {caseInfo.client_phone && (
                    <a href={`tel:${caseInfo.client_phone}`} className={styles.ghostChip} style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}>
                      <Icon name="phone" size={15} color={MUTED} /> Call
                    </a>
                  )}
                </div>
              </Card>
            )}

            {canManage && (
            <Card title="Notes" count={notes.length}>
              {notes.length > 2 && (
                <div className={cd.searchBox} style={{ marginBottom: 10 }}>
                  <Icon name="search" size={15} color="#8C857A" />
                  <input value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} placeholder="Search notes…" className={cd.plainInput} />
                </div>
              )}

              {canAddNote && noteForm === null && (
                <>
                  <div className={cd.composer} style={{ marginTop: 0 }}>
                    <input
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Write a note…"
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                      onKeyDown={(e) => e.key === 'Enter' && submitNote()}
                    />
                    <div className={styles.primaryChip} style={{ opacity: addingNote || !newNote.trim() ? 0.6 : 1 }} onClick={submitNote}>
                      {addingNote ? 'Saving…' : 'Save'}
                    </div>
                  </div>
                  <button className={cd.linkAction} style={{ marginTop: 8 }} onClick={() => setNoteForm({ ...BLANK_FORM, note: newNote })}>
                    Add a title and checklist
                  </button>
                </>
              )}

              {canAddNote && noteForm !== null && (
                <div style={{ border: '1.5px solid #CFC6B0', borderRadius: 3, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} placeholder="Title" style={inputStyle} />
                  <textarea value={noteForm.note} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })} placeholder="What did you observe?" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {noteForm.checklist.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span>{item.text}</span>
                        <button className={cd.linkAction} style={{ marginLeft: 'auto', color: '#B3282D', fontSize: 12 }} onClick={() => setNoteForm({ ...noteForm, checklist: noteForm.checklist.filter((_, j) => j !== i) })}>
                          Remove
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={checklistDraft}
                        onChange={(e) => setChecklistDraft(e.target.value)}
                        placeholder="Add a to-do…"
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistDraftItem())}
                      />
                      <div className={styles.ghostChip} onClick={addChecklistDraftItem}>Add</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div className={styles.primaryChip} style={{ opacity: savingNote ? 0.7 : 1 }} onClick={saveNoteForm}>{savingNote ? 'Saving…' : 'Save note'}</div>
                    <div className={styles.ghostChip} onClick={() => { setNoteForm(null); setChecklistDraft('') }}>Cancel</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                {filteredNotes.map((n) => (
                  <div key={n.id} className={`${cd.noteCard} ${n.pinned ? cd.noteCardPinned : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1A17', flex: 1, minWidth: 0 }}>{n.title}</div>
                      {canAddNote && (
                        <div className={cd.noteTools}>
                          <button className={`${cd.iconBtn} ${n.pinned ? cd.starOn : ''}`} onClick={() => togglePin(n)} title={n.pinned ? 'Unpin note' : 'Pin note'} aria-label={n.pinned ? 'Unpin note' : 'Pin note'}>
                            <Icon name="star" size={14} color={n.pinned ? PRIMARY : '#C9BC9E'} />
                          </button>
                          <button className={cd.iconBtn} onClick={() => setNoteForm({ id: n.id, title: n.title ?? '', note: n.note, checklist: n.checklist ?? [] })} title="Edit note" aria-label="Edit note">
                            <Icon name="edit" size={14} color={MUTED} />
                          </button>
                          <button className={cd.iconBtn} onClick={() => removeNote(n.id)} title="Delete note" aria-label="Delete note">
                            <Icon name="trash-2" size={14} color="#B3282D" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13.5, color: '#1A1A17', marginTop: n.title ? 4 : 0, lineHeight: 1.55 }}>{n.note}</div>
                    {n.checklist && n.checklist.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
                        {n.checklist.map((item, i) => (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: item.checked ? MUTED : '#1A1A17', textDecoration: item.checked ? 'line-through' : 'none', cursor: canAddNote ? 'pointer' : 'default' }}>
                            <input type="checkbox" className={cd.check} checked={item.checked} disabled={!canAddNote} onChange={() => toggleChecklistItem(n, i)} />
                            {item.text}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className={cd.metaRow}>
                      <span>{n.lawyer_name ?? 'Lawyer'}</span>
                      <span>{formatDate(n.created_at)}</span>
                    </div>
                  </div>
                ))}
                {filteredNotes.length === 0 && (
                  <Empty>
                    {noteSearch.trim() ? 'No notes match that search.' : 'Notes are your firm\u2019s own record of the case. Clients never see them.'}
                  </Empty>
                )}
              </div>
            </Card>
            )}
          </div>
        </div>

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>

      {openPrecedent && <SimilarCaseModal docId={openPrecedent} onClose={() => setOpenPrecedent(null)} />}

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
