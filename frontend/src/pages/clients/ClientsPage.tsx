import { useEffect, useState } from 'react'
import { listClients, listCourts, listCaseTypes, sendClientRequest } from '../../api/client'
import type { ClientSummary, CourtOption, CaseTypeOption } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const PRIMARY_DARK = '#8f6743'
const STATUSES = ['All Statuses', 'Active', 'Pending', 'Closed']
const SORTS = ['Newest', 'Oldest', 'Name (A-Z)'] as const
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Active: ['#2E9E58', '#E4F5EA'],
  Pending: ['#B87F1E', '#FFF2E0'],
  Closed: ['#6A5C42', '#EFEAE1'],
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function moneyRound(n: number) {
  return `₹${Math.round(n).toLocaleString()}`
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Statuses')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Newest')
  const [toast, setToast] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [courts, setCourts] = useState<CourtOption[]>([])
  const [caseTypes, setCaseTypes] = useState<CaseTypeOption[]>([])
  const [reqEmail, setReqEmail] = useState('')
  const [reqCourtId, setReqCourtId] = useState('')
  const [reqCaseTypeId, setReqCaseTypeId] = useState('')
  const [reqMessage, setReqMessage] = useState('')
  const [reqError, setReqError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoading(false))
  }, [])

  function openAdd() {
    setAddOpen(true)
    setReqError('')
    if (courts.length === 0) listCourts().then(setCourts).catch(() => {})
    if (caseTypes.length === 0) listCaseTypes().then(setCaseTypes).catch(() => {})
  }

  function closeAdd() {
    setAddOpen(false)
    setReqEmail('')
    setReqCourtId('')
    setReqCaseTypeId('')
    setReqMessage('')
    setReqError('')
  }

  async function submitAdd() {
    if (!reqEmail) { setReqError("Enter the client's email address."); return }
    if (!reqCourtId || !reqCaseTypeId) { setReqError('Choose a court and a case type.'); return }
    setSending(true)
    setReqError('')
    try {
      await sendClientRequest({ email: reqEmail, court_id: Number(reqCourtId), case_type_id: Number(reqCaseTypeId), message: reqMessage || undefined })
      closeAdd()
      setToast('Client request sent.')
      setTimeout(() => setToast(null), 2200)
    } catch (err) {
      setReqError(err instanceof Error ? err.message : 'Failed to send request.')
    } finally {
      setSending(false)
    }
  }

  const searchLower = search.toLowerCase()
  const filtered = clients
    .filter((c) => !searchLower || c.full_name.toLowerCase().includes(searchLower) || c.email.toLowerCase().includes(searchLower))
    .filter((c) => statusFilter === 'All Statuses' || c.status === statusFilter)
    .sort((a, b) => {
      if (sort === 'Name (A-Z)') return a.full_name.localeCompare(b.full_name)
      if (sort === 'Oldest') return a.id - b.id
      return b.id - a.id
    })

  const activeCount = clients.filter((c) => c.status === 'Active').length
  const pendingCount = clients.filter((c) => c.status === 'Pending').length
  const closedCount = clients.filter((c) => c.status === 'Closed').length

  const statCards = [
    { label: 'Total Clients', value: clients.length, icon: 'users' as const, highlight: true },
    { label: 'Active', value: activeCount, icon: 'bar-chart-2' as const },
    { label: 'Pending', value: pendingCount, icon: 'clock' as const },
    { label: 'Closed', value: closedCount, icon: 'check-circle' as const },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Clients</div>
            <div className={styles.subtitle}>Manage relationships, case history and contact details for every client on file.</div>
          </div>
        </div>

        <div className={styles.statCards}>
          {statCards.map((s) => (
            <div
              key={s.label}
              className={styles.statCard}
              style={s.highlight ? { background: '#FBF0D6', border: '1px solid #EAD49B' } : undefined}
            >
              <div
                style={{
                  width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: s.highlight ? PRIMARY_DARK : '#EFE4CB',
                }}
              >
                <Icon name={s.icon} size={18} color={s.highlight ? '#FFFFFF' : '#8f6743'} />
              </div>
              <div className={styles.statValue} style={{ fontSize: 26, marginTop: 4 }}>{String(s.value).padStart(2, '0')}</div>
              <div className={styles.statLabel} style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 700, letterSpacing: '.03em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as (typeof SORTS)[number])} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
            {SORTS.map((s) => <option key={s} value={s}>Sort By: {s}</option>)}
          </select>
          <div className={styles.primaryChip} onClick={openAdd}><Icon name="plus" size={15} color="#FFFFFF" /> Add Client</div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading clients…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((c) => {
              const [color, bg] = STATUS_STYLE_MAP[c.status] || ['#6A5C42', '#EFEAE1']
              return (
                <div key={c.id} style={{ background: '#FFFFFF', border: '1px solid #E7DCC6', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: PRIMARY_DARK, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif", flexShrink: 0 }}>
                    {initialsOf(c.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>{c.full_name}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{c.email}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#A38F66', textTransform: 'uppercase', letterSpacing: '.03em' }}>Status</div>
                    <span className={styles.statusBadge} style={{ color, background: bg, marginTop: 2 }}>{c.status}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#A38F66', textTransform: 'uppercase', letterSpacing: '.03em' }}>Active Cases</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118', marginTop: 2 }}>{c.active_cases}</div>
                  </div>
                  {c.pending_amount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: '#B05C5C', background: '#FBEAEA', borderRadius: 20, padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      <Icon name="alert-triangle" size={12} color="#B05C5C" />{moneyRound(c.pending_amount)} PENDING
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E7DCC6', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B8AB8A', opacity: .5, cursor: 'default' }} title="Client profile coming soon">
                      <Icon name="eye" size={14} />
                    </div>
                    <a href={`mailto:${c.email}`} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E7DCC6', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, textDecoration: 'none' }} title="Email">
                      <Icon name="mail" size={14} />
                    </a>
                    <div style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E7DCC6', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B8AB8A', opacity: .5, cursor: 'default' }} title="Client documents coming soon">
                      <Icon name="file-text" size={14} />
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E7DCC6', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B8AB8A', opacity: .5, cursor: 'default' }} title="Client schedule coming soon">
                      <Icon name="calendar" size={14} />
                    </div>
                  </div>
                  <div className={styles.darkBtn} style={{ opacity: .5, cursor: 'default' }} title="Client profile coming soon">Details</div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ color: MUTED, fontSize: 13.5, textAlign: 'center', padding: '24px 0' }}>No clients found.</div>
            )}
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}

        {addOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={closeAdd}>
            <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 380, boxShadow: '0 20px 48px rgba(0,0,0,.2)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 700, color: '#2A2118', marginBottom: 4 }}>Add Client</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 16 }}>Send a request to represent this client. They'll see it in their notifications and can accept or decline.</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Client email</div>
                  <input
                    type="email"
                    placeholder="client@example.com"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Court</div>
                  <select value={reqCourtId} onChange={(e) => setReqCourtId(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
                    <option value="">Select a court…</option>
                    {courts.map((c) => <option key={c.court_id} value={c.court_id}>{c.court_name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Case type</div>
                  <select value={reqCaseTypeId} onChange={(e) => setReqCaseTypeId(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
                    <option value="">Select a case type…</option>
                    {caseTypes.map((c) => <option key={c.case_type_id} value={c.case_type_id}>{c.case_type_name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Message (optional)</div>
                  <textarea
                    value={reqMessage}
                    onChange={(e) => setReqMessage(e.target.value)}
                    rows={2}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                {reqError && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{reqError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <div className={styles.ghostChip} style={{ flex: 1, justifyContent: 'center' }} onClick={closeAdd}>Cancel</div>
                  <div className={styles.primaryChip} style={{ flex: 1, justifyContent: 'center', opacity: sending ? 0.7 : 1, pointerEvents: sending ? 'none' : 'auto' }} onClick={submitAdd}>
                    {sending ? 'Sending…' : 'Send Request'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
