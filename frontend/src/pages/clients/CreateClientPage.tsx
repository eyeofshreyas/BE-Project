import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCourts, listCaseTypes, sendClientRequest } from '../../api/client'
import type { CourtOption, CaseTypeOption } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const TYPES = ['Individual', 'Organization'] as const

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6A5C42', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#B05C5C' }}> *</span>}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }

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
  const isOrg = clientType === 'Organization'

  const [caseTypeId, setCaseTypeId] = useState('')
  const [courtId, setCourtId] = useState('')
  const [matterName, setMatterName] = useState('')
  const [matterDescription, setMatterDescription] = useState('')
  const [notes, setNotes] = useState('')

  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    listCourts().then(setCourts).catch(() => {})
    listCaseTypes().then(setCaseTypes).catch(() => {})
  }, [])

  const trackedFields = isOrg
    ? [fullName, email, phone, regNumber, contactPerson, courtId, caseTypeId, matterName, matterDescription, notes]
    : [fullName, email, phone, courtId, caseTypeId, matterName, matterDescription, notes]
  const completion = Math.round((trackedFields.filter(Boolean).length / trackedFields.length) * 100)
  const selectedCaseType = caseTypes.find((c) => String(c.case_type_id) === caseTypeId)

  async function submit() {
    if (!fullName.trim()) { setError(isOrg ? "Enter the organization's name." : "Enter the client's full name."); return }
    if (!email.trim()) { setError("Enter the client's email address."); return }
    if (!courtId || !caseTypeId) { setError('Choose a court and a matter category.'); return }

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
      setError(err instanceof Error ? err.message : 'Failed to send invite.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8f6743', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }} onClick={() => navigate('/clients')}>
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
              <div style={{ display: 'flex', gap: 4, background: '#EFE4CB', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                {TYPES.map((t) => (
                  <div
                    key={t}
                    onClick={() => setClientType(t)}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: clientType === t ? '#2A2118' : '#6A5C42', background: clientType === t ? '#FFFFFF' : 'transparent' }}
                  >
                    {t}
                  </div>
                ))}
              </div>

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
                        style={{ border: selected ? '1.5px solid #B08D3E' : '1px solid #E7DCC6', background: selected ? '#FBF0D6' : '#FFFFFF', borderRadius: 12, padding: '14px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: selected ? '#8f6743' : '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="briefcase" size={15} color={selected ? '#FFFFFF' : '#8f6743'} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118' }}>{c.case_type_name}</div>
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
              <div style={{ border: '1.5px dashed #E0CE9E', borderRadius: 12, padding: '32px 16px', textAlign: 'center', background: '#FBF7EE', opacity: .6 }} title="Available once the client accepts and a case is created">
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <Icon name="download" size={17} color="#8f6743" strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>Available after the client accepts</div>
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
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="user-plus" size={16} color="#8f6743" />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2118', fontFamily: "'Poppins', sans-serif" }}>{fullName || 'New Client'}</div>
                  <div style={{ fontSize: 11.5, color: MUTED }}>Pending invite</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Type</span><span className={styles.statusBadge} style={{ background: '#EFE4CB', color: '#6A5C42' }}>{clientType}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Matter</span><strong>{selectedCaseType?.case_type_name ?? '—'}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Documents</span><strong>0 Attached</strong></div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700, marginBottom: 6 }}><span>Profile Completion</span><span>{completion}%</span></div>
                <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${completion}%` }} /></div>
              </div>
            </div>

            <div className={styles.panelCard} style={{ background: '#FBF7EE', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name="info" size={16} color="#8f6743" />
              <div style={{ fontSize: 12, color: '#6A5C42' }}>We'll email this client an invite to LexFlow. Once they accept, a case is created and they'll appear on your client list.</div>
            </div>
          </div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className={styles.ghostChip} onClick={() => navigate('/clients')}>Cancel</div>
          <div className={styles.primaryChip} style={{ opacity: sending ? 0.7 : 1, pointerEvents: sending ? 'none' : 'auto' }} onClick={submit}>
            {sending ? 'Sending…' : 'Create Client →'}
          </div>
        </div>
      </div>
    </div>
  )
}
