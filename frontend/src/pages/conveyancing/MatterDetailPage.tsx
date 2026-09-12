/** `/conveyancing/matters/:matterId` route: one matter in full -- overview, property,
 * registration-progress stepper, due diligence, the registration appointment, and shared
 * documents (preview/download via the document endpoints, upload via `uploadMatterDocument()`).
 * Staff get the editable controls: click-to-complete progress stages and a live due-diligence
 * checklist. A client sees the same page read-only but can still upload a requested document. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMatterDetail, getDocumentDownloadUrl, uploadMatterDocument, updateDueDiligence, completeProgressStage } from '../../api/client'
import type { MatterDetail, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import { isPreviewable, uploadRejection } from '../../utils/files'
import { formatDate as formatDateWith } from '../../utils/date'
import styles from './ConveyancingDashboardPage.module.css'

const PRIMARY_DARK = '#1A2551'
const MUTED = '#6E6759'
const ADMIN = 1
const LAWYER = 2

type DiligenceField = 'title_clear' | 'tax_verified' | 'encumbrance_checked' | 'litigation_checked'
const DILIGENCE_CHECKS: [DiligenceField, string][] = [
  ['title_clear', 'Title clear'],
  ['tax_verified', 'Taxes verified'],
  ['encumbrance_checked', 'Encumbrance checked'],
  ['litigation_checked', 'Litigation checked'],
]

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function formatDate(iso: string) {
  return formatDateWith(iso, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Builds the description from real matter/property/progress fields -- there's no free-text description column, so this reads as one. */
function matterDescription(m: MatterDetail): string {
  if (!m.property) return `${m.transaction_type ?? m.matter_type ?? 'Matter'} in progress.`
  const kind = m.property.property_type ? `${m.property.property_type.toLowerCase()} ` : ''
  const place = [m.property.address, m.property.city].filter(Boolean).join(', ')
  const base = `${m.transaction_type ?? m.matter_type ?? 'Transaction'} of ${kind}property at ${place}.`
  const next = m.progress.find((s) => !s.completed)
  const tail = next ? ` Currently in the ${next.stage_name} stage.` : m.progress.length > 0 ? ' Registration complete.' : ''
  return base + tail
}

function formatArea(property: MatterDetail['property']) {
  const value = property?.builtup_area ?? property?.land_area
  return value != null ? `${value.toLocaleString()} sq ft` : '—'
}

export default function MatterDetailPage() {
  const { matterId: matterIdParam } = useParams()
  const navigate = useNavigate()
  const matterId = Number(matterIdParam)
  // staff get the editable controls; a client sees the same page read-only
  const profile = loadProfile()
  const canEdit = profile?.role_id === ADMIN || profile?.role_id === LAWYER

  const [matter, setMatter] = useState<MatterDetail | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!matterId) { setError('Invalid matter.'); return }
    getMatterDetail(matterId)
      .then(setMatter)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this matter.'))
  }, [matterId])

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const rejection = uploadRejection(file)
    if (rejection) { setUploadError(rejection); return }
    setUploading(true)
    setUploadError('')
    try {
      const created = await uploadMatterDocument(matterId, file)
      setMatter((prev) => (prev ? { ...prev, documents: [...prev.documents, created] } : prev))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload document.')
    } finally {
      setUploading(false)
    }
  }

  /** Marks one pending stage complete; the server recomputes completion_percentage from all stages. */
  async function completeStage(progressId: number) {
    if (!canEdit || saving) return
    setSaving(true)
    try {
      const updated = await completeProgressStage(matterId, progressId)
      setMatter((prev) => (prev ? { ...prev, progress: prev.progress.map((s) => (s.progress_id === progressId ? updated : s)) } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update this stage.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleDiligence(field: DiligenceField, next: boolean) {
    if (!canEdit || saving) return
    setSaving(true)
    try {
      const updated = await updateDueDiligence(matterId, { [field]: next })
      setMatter((prev) => (prev ? { ...prev, due_diligence: updated } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update due diligence.')
    } finally {
      setSaving(false)
    }
  }

  async function downloadDoc(documentId: number) {
    const tab = window.open('', '_blank')
    try {
      const { url } = await getDocumentDownloadUrl(documentId)
      if (tab) tab.location.href = url
    } catch {
      tab?.close()
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.breadcrumb}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/conveyancing')}>Conveyancing</span>
          <span>&rsaquo;</span>
          <span>{matter?.matter_number ?? 'Matter'}</span>
        </div>

        <div className={styles.header}>
          <div>
            <div className={styles.title}>{matter?.matter_number ?? 'Matter Details'}</div>
            <div className={styles.subtitle}>{matter ? matterDescription(matter) : 'Loading this matter…'}</div>
          </div>
        </div>

        {!matter && !error && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading matter…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {matter && (
          <div className={styles.matterGrid}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Overview</div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em' }}>Initiated</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1A1A17', marginTop: 4 }}>{matter.created_at ? formatDate(matter.created_at) : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em' }}>Target Completion</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1A1A17', marginTop: 4 }}>{matter.expected_completion_date ? formatDate(matter.expected_completion_date) : '—'}</div>
                  </div>
                </div>
              </div>

              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Property Details</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {([
                    ['Type', matter.property?.property_type ?? '—'],
                    ['Survey No.', matter.property?.survey_number ?? '—'],
                    ['Area', formatArea(matter.property)],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #F1EDE0', fontSize: 13.5 }}>
                      <div style={{ color: MUTED }}>{label}</div>
                      <div style={{ fontWeight: 700, color: '#1A1A17' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Due Diligence</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {DILIGENCE_CHECKS.map(([field, label]) => (
                    <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: '#1A1A17', cursor: canEdit ? 'pointer' : 'default' }}>
                      <input
                        type="checkbox"
                        checked={matter.due_diligence?.[field] ?? false}
                        disabled={!canEdit || saving}
                        onChange={(e) => toggleDiligence(field, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {matter.due_diligence?.remarks && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 10 }}>{matter.due_diligence.remarks}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Registration Progress</div>
                <div className={styles.timeline}>
                  {matter.progress.map((s) => {
                    const clickable = canEdit && !s.completed
                    return (
                      <div key={s.progress_id} className={styles.timelineItem} style={{ cursor: clickable ? 'pointer' : 'default' }} onClick={() => clickable && completeStage(s.progress_id)}>
                        <span className={styles.timelineDot} style={{ background: s.completed ? PRIMARY_DARK : '#FCFAF4', border: `2px solid ${PRIMARY_DARK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {s.completed && <Icon name="check-circle" size={9} color="#FCFAF4" strokeWidth={3} />}
                        </span>
                        <div className={styles.timelineTitle} style={{ fontWeight: 700 }}>{s.stage_name}</div>
                        <div className={styles.timelineMeta}>{s.completed ? (s.completed_at ? formatDate(s.completed_at) : 'Completed') : clickable ? 'Pending — click to complete' : 'Pending'}</div>
                      </div>
                    )
                  })}
                  {matter.progress.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No progress stages yet.</div>}
                </div>
              </div>

              {matter.registration && (
                <div className={styles.panelCard}>
                  <div className={styles.panelTitle}>Registration Appointment</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {([
                      ['Office', matter.registration.office_name ?? '—'],
                      ['Date', matter.registration.registration_date ? formatDate(matter.registration.registration_date) : 'Not scheduled'],
                      ['Status', matter.registration.registration_status ?? '—'],
                      // only filled in once the deed is actually registered
                      ...(matter.registration.registration_number ? [['Registration No.', matter.registration.registration_number]] : []),
                      ...(matter.registration.deed_number ? [['Deed No.', matter.registration.deed_number]] : []),
                      ...(matter.registration.registered_by ? [['Registered by', matter.registration.registered_by]] : []),
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid #F1EDE0', fontSize: 13.5 }}>
                        <div style={{ color: MUTED, flexShrink: 0 }}>{label}</div>
                        <div style={{ fontWeight: 700, color: '#1A1A17', textAlign: 'right' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {matter.registration.remarks && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 10 }}>{matter.registration.remarks}</div>}
                </div>
              )}

              <div className={styles.panelCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div className={styles.panelTitle} style={{ marginBottom: 0 }}>Shared Documents</div>
                  <div className={styles.primaryChip} style={{ opacity: uploading ? .6 : 1, cursor: uploading ? 'default' : 'pointer' }} onClick={() => !uploading && fileInputRef.current?.click()}>
                    <Icon name="upload-cloud" size={15} color="#FCFAF4" /> {uploading ? 'Uploading…' : 'Upload Requested Document'}
                  </div>
                  <input ref={fileInputRef} type="file" onChange={handleFileChosen} style={{ display: 'none' }} />
                </div>
                {uploadError && <div style={{ color: '#B3282D', fontSize: 12.5, marginBottom: 10 }}>{uploadError}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {matter.documents.map((d) => (
                    <div key={d.matter_document_id} style={{ padding: '10px 14px', border: '1px solid #CFC6B0', borderRadius: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icon name="file-text" size={17} color={MUTED} />
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1A1A17' }}>{d.file_name ?? 'Document'}</div>
                        <span className={styles.statusBadge} style={d.is_verified ? { color: '#4A6B4E', background: '#E4EDE5' } : { color: '#8A6A2F', background: '#F3EBD9' }}>
                          {d.is_verified ? 'Verified' : d.is_required ? 'Required' : 'Pending'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                        <span
                          style={{ fontSize: 12.5, fontWeight: 600, color: '#23306B', cursor: 'pointer' }}
                          onClick={() => (d.mime_type && isPreviewable(d.mime_type) ? navigate(`/documents/${d.document_id}`) : downloadDoc(d.document_id))}
                        >
                          Preview
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#23306B', cursor: 'pointer' }} onClick={() => downloadDoc(d.document_id)}>Download</span>
                      </div>
                    </div>
                  ))}
                  {matter.documents.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No shared documents yet.</div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
