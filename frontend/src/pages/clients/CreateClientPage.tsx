/**
 * `/clients/new` route: builds an individual/organization client profile and an
 * initial matter, then sends an invite email via `sendClientRequest()` -- no
 * client record is created directly; the client is added once they accept.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCourts, listCaseTypes, sendClientRequest } from '../../api/client'
import type { CourtOption, CaseTypeOption } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#6E6759'
const TYPES = ['Individual', 'Organization'] as const

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#575145', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#B3282D' }}> *</span>}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }

/** Loads courts/case types for the matter section; `reviewAndConfirm` validates and opens a confirm dialog, `submit` calls `sendClientRequest()` and navigates to `/clients`. */
export default function CreateClientPage() {
  const navigate = useNavigate()
  const [courts, setCourts] = useState<CourtOption[]>([])
  const [caseTypes, setCaseTypes] = useState<CaseTypeOption[]>([])

  const [clientType, setClientType] = useState<(typeof TYPES)[number]>('Individual')
  const [fullName, setFullName] = useState('')
  const [preferredTitle, setPreferredTitle] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [regNumber, setRegNumber] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactDesignation, setContactDesignation] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const isOrg = clientType === 'Organization'

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setLogoPreview(URL.createObjectURL(file))
  }

  const [caseTypeId, setCaseTypeId] = useState('')
  const [courtId, setCourtId] = useState('')
  const [matterName, setMatterName] = useState('')
  const [matterDescription, setMatterDescription] = useState('')
  const [notes, setNotes] = useState('')

  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    listCourts().then(setCourts).catch(() => {})
    listCaseTypes().then(setCaseTypes).catch(() => {})
  }, [])

  const trackedFields = isOrg
    ? [fullName, email, phone, regNumber, contactPerson, courtId, caseTypeId, matterName, matterDescription, notes]
    : [fullName, email, phone, courtId, caseTypeId, matterName, matterDescription, notes]
  const completion = Math.round((trackedFields.filter(Boolean).length / trackedFields.length) * 100)
  const selectedCaseType = caseTypes.find((c) => String(c.case_type_id) === caseTypeId)

  function reviewAndConfirm() {
    if (!fullName.trim()) { setError(isOrg ? "Enter the organization's name." : "Enter the client's full name."); return }
    if (!email.trim()) { setError("Enter the client's email address."); return }
    if (!courtId || !caseTypeId) { setError('Choose a court and a matter category.'); return }
    setError('')
    setConfirmOpen(true)
  }

  async function submit() {
    const messageParts = isOrg
      ? [
          `Client type: Organization`,
          `Organization: ${fullName}`,
          regNumber && `Registration / GST No.: ${regNumber}`,
          contactPerson && `Contact Person: ${contactPerson}${contactDesignation ? ` (${contactDesignation})` : ''}`,
          phone && `Phone: ${phone}`,
          matterName && `Matter: ${matterName}`,
          matterDescription && `Details: ${matterDescription}`,
          notes && `Internal notes: ${notes}`,
        ].filter(Boolean)
      : [
          `Client type: Individual`,
          `Contact: ${preferredTitle ? preferredTitle + ' ' : ''}${fullName}`,
          phone && `Phone: ${phone}`,
          matterName && `Matter: ${matterName}`,
          matterDescription && `Details: ${matterDescription}`,
          notes && `Internal notes: ${notes}`,
        ].filter(Boolean)

    setSending(true)
    setError('')
    try {
      await sendClientRequest({ email: email.trim(), court_id: Number(courtId), case_type_id: Number(caseTypeId), message: messageParts.join('\n') })
      navigate('/clients', { state: { toast: 'Invite sent — the client will appear once they accept.' } })
    } catch (err) {
      setConfirmOpen(false)
      setError(err instanceof Error ? err.message : 'Failed to send invite.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#1A2551', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }} onClick={() => navigate('/clients')}>
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icon name="chevron-down" size={14} strokeWidth={2.2} /></span> Back to Clients
        </div>

        <div className={styles.header}>
          <div>
            <div className={styles.title}>Create New Client</div>
            <div className={styles.subtitle}>Build a client profile and send them an invite to connect on LexFlow.</div>
          </div>
        </div>

        <div className={styles.midGrid}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 4, background: '#E6E0CE', borderRadius: 3, padding: 4, width: 'fit-content' }}>
                {TYPES.map((t) => (
                  <div
                    key={t}
                    onClick={() => setClientType(t)}
                    style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: clientType === t ? '#1A1A17' : '#575145', background: clientType === t ? '#FCFAF4' : 'transparent' }}
                  >
                    {t}
                  </div>
                ))}
              </div>

              {isOrg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <label style={{ width: 64, height: 64, borderRadius: 3, border: '1.5px dashed #E6E0CE', background: '#F6F2E9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, overflow: 'hidden' }}>
                    {logoPreview ? (
                      <img src={logoPreview} alt="Organization logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Icon name="briefcase" size={20} color="#1A2551" />
                    )}
                    <input type="file" accept="image/*" onChange={pickLogo} style={{ display: 'none' }} />
                  </label>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17' }}>{logoPreview ? 'Logo selected' : 'Upload Logo'}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>Preview only for now — re-attach it to their profile once the client accepts.</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {isOrg ? (
                  <>
                    <Field label="Organization Name" required><input placeholder="e.g. Vance Textiles Pvt. Ltd." value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} /></Field>
                    <Field label="Registration / GST No."><input placeholder="e.g. 27AAAPL1234C1Z5" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} style={inputStyle} /></Field>
                    <Field label="Email Address" required><input type="email" placeholder="contact@client.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Field>
                    <Field label="Phone Number"><input placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></Field>
                    <Field label="Contact Person"><input placeholder="e.g. Eleanor Vance" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} style={inputStyle} /></Field>
                    <Field label="Contact Designation"><input placeholder="e.g. Managing Director" value={contactDesignation} onChange={(e) => setContactDesignation(e.target.value)} style={inputStyle} /></Field>
                  </>
                ) : (
                  <>
                    <Field label="Full Name" required><input placeholder="e.g. Eleanor Vance" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} /></Field>
                    <Field label="Preferred Title"><input placeholder="e.g. Ms., Dr." value={preferredTitle} onChange={(e) => setPreferredTitle(e.target.value)} style={inputStyle} /></Field>
                    <Field label="Email Address" required><input type="email" placeholder="contact@client.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Field>
                    <Field label="Phone Number"><input placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></Field>
                  </>
                )}
              </div>
            </div>

            <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.panelTitle} style={{ marginBottom: 0 }}>Initial Legal Matter</div>

              <Field label="Matter Category" required>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  {caseTypes.map((c) => {
                    const selected = caseTypeId === String(c.case_type_id)
                    return (
                      <div
                        key={c.case_type_id}
                        onClick={() => setCaseTypeId(String(c.case_type_id))}
                        style={{ border: selected ? '1.5px solid #23306B' : '1px solid #CFC6B0', background: selected ? '#F3EBD9' : '#FCFAF4', borderRadius: 3, padding: '14px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 3, background: selected ? '#1A2551' : '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="briefcase" size={15} color={selected ? '#FCFAF4' : '#1A2551'} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17' }}>{c.case_type_name}</div>
                      </div>
                    )
                  })}
                  {caseTypes.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>Loading matter categories…</div>}
                </div>
              </Field>

              <Field label="Court" required>
                <select value={courtId} onChange={(e) => setCourtId(e.target.value)} style={inputStyle}>
                  <option value="">Select a court…</option>
                  {courts.map((c) => <option key={c.court_id} value={c.court_id}>{c.court_name}</option>)}
                </select>
              </Field>

              <Field label="Matter Name / Reference"><input placeholder="e.g. Corporate Restructuring 2026" value={matterName} onChange={(e) => setMatterName(e.target.value)} style={inputStyle} /></Field>

              <Field label="Matter Description">
                <textarea placeholder="Briefly describe the context and objectives of this matter…" value={matterDescription} onChange={(e) => setMatterDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </Field>
            </div>

            <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={styles.panelTitle} style={{ marginBottom: 0 }}>Initial Documents</div>
              <div style={{ border: '1.5px dashed #E6E0CE', borderRadius: 3, padding: '32px 16px', textAlign: 'center', background: '#F6F2E9', opacity: .6 }} title="Available once the client accepts and a case is created">
                <div style={{ width: 40, height: 40, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <Icon name="download" size={17} color="#1A2551" strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1A1A17' }}>Available after the client accepts</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Document uploads unlock once a case exists for this client.</div>
              </div>
            </div>

            <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={styles.panelTitle} style={{ marginBottom: 0 }}>Internal Notes</div>
              <textarea placeholder="Add any preliminary notes, referral sources, or specific preferences — visible to your firm only." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>

          <div className={styles.sideCol}>
            <div className={styles.panelCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="user-plus" size={16} color="#1A2551" />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1A17', fontFamily: "'Spectral', serif" }}>{fullName || 'New Client'}</div>
                  <div style={{ fontSize: 11.5, color: MUTED }}>Pending invite</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Type</span><span className={styles.statusBadge} style={{ background: '#E6E0CE', color: '#575145' }}>{clientType}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Matter</span><strong>{selectedCaseType?.case_type_name ?? '—'}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Documents</span><strong>0 Attached</strong></div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em', fontWeight: 700, marginBottom: 6 }}><span>Profile Completion</span><span>{completion}%</span></div>
                <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${completion}%` }} /></div>
              </div>
            </div>

            <div className={styles.panelCard} style={{ background: '#F6F2E9', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name="info" size={16} color="#1A2551" />
              <div style={{ fontSize: 12, color: '#575145' }}>We'll email this client an invite to LexFlow. Once they accept, a case is created and they'll appear on your client list.</div>
            </div>
          </div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: '#B3282D' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className={styles.ghostChip} onClick={() => navigate('/clients')}>Cancel</div>
          <div className={styles.primaryChip} onClick={reviewAndConfirm}>Create Client →</div>
        </div>

        {confirmOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(35, 48, 107,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => !sending && setConfirmOpen(false)}>
            <div style={{ background: '#FCFAF4', borderRadius: 3, padding: 24, width: 400, boxShadow: '0 20px 48px rgba(0,0,0,.2)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontFamily: "'Spectral', serif", fontSize: 16, fontWeight: 700, color: '#1A1A17', marginBottom: 4 }}>Send invite to {fullName || 'this client'}?</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 16 }}>Review before sending — this emails them a real invite.</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, background: '#F6F2E9', border: '1px solid #CFC6B0', borderRadius: 3, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Type</span><strong>{clientType}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Email</span><strong>{email}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Matter</span><strong>{selectedCaseType?.case_type_name ?? '—'}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Court</span><strong>{courts.find((c) => String(c.court_id) === courtId)?.court_name ?? '—'}</strong></div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div className={styles.ghostChip} style={{ flex: 1, justifyContent: 'center', opacity: sending ? 0.6 : 1, pointerEvents: sending ? 'none' : 'auto' }} onClick={() => setConfirmOpen(false)}>Back</div>
                <div className={styles.primaryChip} style={{ flex: 1, justifyContent: 'center', opacity: sending ? 0.7 : 1, pointerEvents: sending ? 'none' : 'auto' }} onClick={submit}>
                  {sending ? 'Sending…' : 'Confirm & Send Invite'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
