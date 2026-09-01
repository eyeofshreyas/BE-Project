import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCourts, listCaseTypes, listClients, listDocumentTypes, createCase, uploadDocument } from '../../api/client'
import type { CourtOption, CaseTypeOption, ClientSummary, DocumentTypeOption } from '../../types/api'
import { Icon, type IconName } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const PRIORITIES = ['Low', 'Medium', 'High'] as const
const PRIORITY_DOT: Record<(typeof PRIORITIES)[number], string> = { Low: '#4CAF6D', Medium: '#B08D3E', High: '#D64545' }

const CASE_TYPE_META: Record<string, { icon: IconName; blurb: string }> = {
  civil: { icon: 'scale', blurb: 'Disputes & torts' },
  criminal: { icon: 'shield', blurb: 'Prosecution & defence' },
  family: { icon: 'users', blurb: 'Custody & succession' },
  corporate: { icon: 'briefcase', blurb: 'Tax & compliance' },
  property: { icon: 'home', blurb: 'Title & tenancy' },
  other: { icon: 'more-horizontal', blurb: 'Anything else' },
}

function metaFor(name: string) {
  const key = Object.keys(CASE_TYPE_META).find((k) => name.toLowerCase().includes(k))
  return key ? CASE_TYPE_META[key] : { icon: 'file-text' as IconName, blurb: '' }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6A5C42', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }

export default function CreateCasePage() {
  const navigate = useNavigate()
  const [courts, setCourts] = useState<CourtOption[]>([])
  const [caseTypes, setCaseTypes] = useState<CaseTypeOption[]>([])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [docTypes, setDocTypes] = useState<DocumentTypeOption[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [caseTypeId, setCaseTypeId] = useState('')
  const [caseName, setCaseName] = useState('')
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium')
  const [clientQuery, setClientQuery] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [nextHearing, setNextHearing] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [courtId, setCourtId] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listCourts().then(setCourts).catch(() => {})
    listCaseTypes().then((types) => { setCaseTypes(types); if (types[0]) setCaseTypeId(String(types[0].case_type_id)) }).catch(() => {})
    listClients().then(setClients).catch(() => {})
    listDocumentTypes().then(setDocTypes).catch(() => {})
  }, [])

  const ACCEPTED = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  const ACCEPTED_EXT = /\.(pdf|docx?|jpe?g|png|gif|webp|heic|mp4|mov|avi|webm|mkv)$/i

  function addFiles(list: FileList | null) {
    if (!list) return
    const picked = Array.from(list).filter((f) => ACCEPTED.includes(f.type) || f.type.startsWith('image/') || f.type.startsWith('video/') || ACCEPTED_EXT.test(f.name))
    setFiles((prev) => [...prev, ...picked])
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  const filteredClients = clients.filter((c) => c.full_name.toLowerCase().includes(clientQuery.toLowerCase()))

  function pickClient(c: ClientSummary) {
    setClientId(String(c.id))
    setClientQuery(c.full_name)
    setEmail(c.email)
    setPhone(c.phone)
    setClientDropdownOpen(false)
  }

  async function submit() {
    if (!caseTypeId) { setError('Pick a case type.'); return }
    if (!caseName.trim()) { setError('Enter a case name.'); return }
    if (!clientId) { setError('Search and select an existing client.'); return }
    if (!courtId) { setError('Choose a court / jurisdiction.'); return }

    setSaving(true)
    setError('')
    try {
      const created = await createCase({
        case_type_id: Number(caseTypeId),
        case_title: caseName.trim(),
        client_id: Number(clientId),
        court_id: Number(courtId),
        priority,
        next_hearing_date: nextHearing || undefined,
        description: description.trim() || undefined,
      })

      let failedUploads = 0
      if (files.length && docTypes[0]) {
        const results = await Promise.allSettled(files.map((f) => uploadDocument(created.case_id, f, docTypes[0].document_type_id)))
        failedUploads = results.filter((r) => r.status === 'rejected').length
      }

      const toast = failedUploads
        ? `Case ${created.id} created — ${failedUploads} of ${files.length} document(s) failed to upload.`
        : `Case ${created.id} created${files.length ? ` with ${files.length} document(s) uploaded.` : '.'}`
      navigate(`/cases/${created.case_id}`, { state: { toast } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8f6743', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }} onClick={() => navigate('/cases')}>
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icon name="chevron-down" size={14} strokeWidth={2.2} /></span> Back to Cases
        </div>

        <div className={styles.header}>
          <div>
            <div className={styles.title}>Create New Case</div>
            <div className={styles.subtitle}>Set up the essentials and start managing your case.</div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.ghostChip} onClick={() => navigate('/cases')}>Cancel</div>
            <div className={styles.primaryChip} style={{ opacity: saving ? 0.7 : 1, pointerEvents: saving ? 'none' : 'auto' }} onClick={submit}>
              {saving ? 'Creating…' : <>Create Case →</>}
            </div>
          </div>
        </div>

        <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Case Type">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {caseTypes.map((c) => {
                const selected = caseTypeId === String(c.case_type_id)
                const meta = metaFor(c.case_type_name)
                return (
                  <div
                    key={c.case_type_id}
                    onClick={() => setCaseTypeId(String(c.case_type_id))}
                    style={{ border: selected ? '1.5px solid #B08D3E' : '1px solid #E7DCC6', background: selected ? '#FBF0D6' : '#FFFFFF', borderRadius: 12, padding: '14px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}
                  >
                    {selected && (
                      <div style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: '50%', background: '#B08D3E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="check-circle" size={12} color="#FFFFFF" />
                      </div>
                    )}
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: selected ? '#8f6743' : '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={meta.icon} size={16} color={selected ? '#FFFFFF' : '#8f6743'} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2A2118' }}>{c.case_type_name}</div>
                    <div style={{ fontSize: 11.5, color: MUTED }}>{c.description || meta.blurb}</div>
                  </div>
                )
              })}
              {caseTypes.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>Loading case types…</div>}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Case Name"><input placeholder="e.g. Smith vs. Johnson" value={caseName} onChange={(e) => setCaseName(e.target.value)} style={inputStyle} /></Field>
            <Field label="Priority">
              <div style={{ display: 'flex', gap: 6, background: '#FBF7EE', border: '1.5px solid #E7DCC6', borderRadius: 9, padding: 4 }}>
                {PRIORITIES.map((p) => (
                  <div key={p} onClick={() => setPriority(p)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 0', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: priority === p ? '#FFFFFF' : '#6A5C42', background: priority === p ? '#B08D3E' : 'transparent' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: priority === p ? '#FFFFFF' : PRIORITY_DOT[p] }} /> {p}
                  </div>
                ))}
              </div>
            </Field>

            <Field label="Client">
              <div style={{ position: 'relative' }} onBlur={() => setTimeout(() => setClientDropdownOpen(false), 120)}>
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="search" size={14} color={MUTED} />
                  <input
                    placeholder="Search client name…"
                    value={clientQuery}
                    onChange={(e) => { setClientQuery(e.target.value); setClientId(''); setClientDropdownOpen(true) }}
                    onFocus={() => setClientDropdownOpen(true)}
                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13.5, background: 'transparent' }}
                  />
                </div>
                {clientDropdownOpen && filteredClients.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#FFFFFF', border: '1px solid #E7DCC6', borderRadius: 9, boxShadow: '0 8px 20px rgba(0,0,0,.08)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                    {filteredClients.map((c) => (
                      <div key={c.id} onMouseDown={() => pickClient(c)} style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}>
                        {c.full_name} <span style={{ color: MUTED, fontSize: 11.5 }}>· {c.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Next Hearing"><input type="date" value={nextHearing} onChange={(e) => setNextHearing(e.target.value)} style={inputStyle} /></Field>

            <Field label="Email ID"><input type="email" placeholder="e.g. client@email.com" value={email} readOnly style={{ ...inputStyle, background: '#FBF7EE', color: MUTED }} /></Field>
            <Field label="Phone Number"><input placeholder="e.g. +91 98765 43210" value={phone} readOnly style={{ ...inputStyle, background: '#FBF7EE', color: MUTED }} /></Field>
          </div>

          <Field label="Court / Jurisdiction">
            <select value={courtId} onChange={(e) => setCourtId(e.target.value)} style={inputStyle}>
              <option value="">Select a court…</option>
              {courts.map((c) => <option key={c.court_id} value={c.court_id}>{c.court_name}</option>)}
            </select>
          </Field>

          <Field label="Short Case Description">
            <textarea placeholder="Briefly describe the nature of the case…" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </Field>

          <Field label="Upload Documents">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,image/*,video/*"
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
              style={{ border: `1.5px dashed ${dragOver ? '#B08D3E' : '#E0CE9E'}`, borderRadius: 12, padding: '32px 16px', textAlign: 'center', background: dragOver ? '#F5EAD0' : '#FBF7EE', cursor: 'pointer' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <Icon name="download" size={17} color="#8f6743" strokeWidth={1.8} />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>Drop files here, or click to browse</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>PDF, Word, images, or video · uploaded once the case is created</div>
            </div>

            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {files.map((f) => (
                  <div key={f.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5, background: '#FFFFFF', border: '1px solid #E7DCC6', borderRadius: 8, padding: '7px 10px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Icon name="file-text" size={14} color="#8f6743" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ color: MUTED }}>{(f.size / 1024).toFixed(0)} KB</span>
                      <span onClick={(e) => { e.stopPropagation(); removeFile(f.name) }} style={{ cursor: 'pointer', display: 'flex' }}>
                        <Icon name="x" size={13} color={MUTED} />
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Field>
        </div>

        {error && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{error}</div>}
      </div>
    </div>
  )
}
