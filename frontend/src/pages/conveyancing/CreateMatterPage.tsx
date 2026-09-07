/** `/conveyancing/matters/new` route: new-matter form (matter details, client search, property details). */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listClients, createMatter } from '../../api/client'
import type { ClientSummary } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from './ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const MATTER_TYPES = ['Sale', 'Purchase', 'Mortgage', 'Lease', 'Other']
const PROPERTY_TYPES = ['Residential House', 'Apartment', 'Commercial', 'Land', 'Other']
const PRIORITIES = ['Low', 'Medium', 'High'] as const

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#6A5C42', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#D64545' }}> *</span>}
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8C7C5E', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #E7DCC6', paddingBottom: 10, marginBottom: 4 }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }

/**
 * Loads `listClients()` for the client search on mount, then on submit calls
 * `createMatter()` (matter_type doubles as transaction_type server-side; the
 * matter_number is generated on the backend, along with a lightweight case
 * that carries the client/priority -- `cases.client_id` is required) and
 * navigates back to `/conveyancing`. Client selection is required for that
 * reason even though the mockup doesn't mark it so. Responsible Lawyer is
 * decorative: the backend assigns whoever is creating the matter instead,
 * since there's no accessible lawyer-directory endpoint for non-admins.
 */
export default function CreateMatterPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientSummary[]>([])

  const [matterName, setMatterName] = useState('')
  const [matterType, setMatterType] = useState(MATTER_TYPES[0])
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium')
  const [lawyerQuery, setLawyerQuery] = useState('')

  const [clientQuery, setClientQuery] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)

  const [propertyAddress, setPropertyAddress] = useState('')
  const [propertyType, setPropertyType] = useState(PROPERTY_TYPES[0])
  const [titleNumber, setTitleNumber] = useState('')
  const [saleValue, setSaleValue] = useState('')
  const [targetDate, setTargetDate] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listClients().then(setClients).catch(() => {})
  }, [])

  const filteredClients = clients.filter((c) => c.full_name.toLowerCase().includes(clientQuery.toLowerCase()))

  function pickClient(c: ClientSummary) {
    setClientId(String(c.id))
    setClientQuery(c.full_name)
    setClientDropdownOpen(false)
  }

  async function submit() {
    if (!matterName.trim()) { setError('Enter a matter name.'); return }
    if (!clientId) { setError('Search and select a client for this matter.'); return }

    setSaving(true)
    setError('')
    try {
      const created = await createMatter({
        matter_name: matterName.trim(),
        matter_type: matterType,
        client_id: Number(clientId),
        priority,
        property_address: propertyAddress.trim() || undefined,
        property_type: propertyType,
        title_number: titleNumber.trim() || undefined,
        sale_value: saleValue ? Number(saleValue) : undefined,
        target_settlement_date: targetDate || undefined,
      })
      navigate('/conveyancing', { state: { toast: `Matter ${created.matter_number} created.` } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create matter.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8f6743', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }} onClick={() => navigate('/conveyancing')}>
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icon name="chevron-down" size={14} strokeWidth={2.2} /></span> Back to Conveyancing
        </div>

        <div className={styles.header}>
          <div>
            <div className={styles.title}>Create New Matter</div>
            <div className={styles.subtitle}>Add the essential details to start managing this conveyancing matter.</div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.ghostChip} onClick={() => navigate('/conveyancing')}>Cancel</div>
            <div className={styles.primaryChip} style={{ opacity: saving ? 0.7 : 1, pointerEvents: saving ? 'none' : 'auto' }} onClick={submit}>
              {saving ? 'Creating…' : <>Create Matter →</>}
            </div>
          </div>
        </div>

        <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionTitle>Matter Details</SectionTitle>

          <Field label="Matter Name" required>
            <input placeholder="e.g. Smith - 123 Main St Purchase" value={matterName} onChange={(e) => setMatterName(e.target.value)} style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Matter Type">
              <select value={matterType} onChange={(e) => setMatterType(e.target.value)} style={inputStyle}>
                {MATTER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Matter Number">
              <input value="Auto-generated on save" readOnly style={{ ...inputStyle, background: '#FBF7EE', color: MUTED }} />
            </Field>

            <Field label="Priority">
              <div style={{ display: 'flex', gap: 6, background: '#FBF7EE', border: '1.5px solid #E7DCC6', borderRadius: 9, padding: 4 }}>
                {PRIORITIES.map((p) => (
                  <div key={p} onClick={() => setPriority(p)} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: priority === p ? '#FFFFFF' : '#6A5C42', background: priority === p ? '#B08D3E' : 'transparent' }}>
                    {p}
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Responsible Lawyer">
              <input placeholder="Search lawyer..." value={lawyerQuery} onChange={(e) => setLawyerQuery(e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <SectionTitle>Client</SectionTitle>

          <Field label="Select Client" required>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ position: 'relative', flex: 1 }} onBlur={() => setTimeout(() => setClientDropdownOpen(false), 120)}>
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="search" size={14} color={MUTED} />
                  <input
                    placeholder="Search existing clients..."
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
              <a href="/clients/new" target="_blank" rel="noreferrer" className={styles.ghostChip} style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>
                <Icon name="plus" size={14} color="#8f6743" /> Add New Client
              </a>
            </div>
          </Field>

          <SectionTitle>Property Details</SectionTitle>

          <Field label="Property Address">
            <input placeholder="Enter full property address" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Property Type">
              <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} style={inputStyle}>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Title / Property Number">
              <input placeholder="e.g. Vol 1234 Fol 567" value={titleNumber} onChange={(e) => setTitleNumber(e.target.value)} style={inputStyle} />
            </Field>

            <Field label="Sale / Property Value">
              <input type="number" placeholder="₹ 0.00" value={saleValue} onChange={(e) => setSaleValue(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Target Settlement Date">
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{error}</div>}
      </div>
    </div>
  )
}
