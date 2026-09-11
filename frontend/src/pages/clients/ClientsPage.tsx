/** `/clients` route (lawyer/admin): searchable/sortable/filterable client list. Reads an optional `location.state.toast` (set by `CreateClientPage` after navigating here). */
import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { listClients, listInvoices } from '../../api/client'
import type { ClientSummary } from '../../types/api'
import { Icon } from '../../components/icons'
import { Dropdown } from '../conveyancing/ConveyancingDashboardPage'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#6E6759'
const PRIMARY_DARK = '#1A2551'
const STATUSES = ['All Statuses', 'Active', 'Pending', 'Closed']
const SORTS = ['Newest', 'Oldest', 'Name (A-Z)'] as const
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Active: ['#4A6B4E', '#E4EDE5'],
  Pending: ['#8A6A2F', '#F3EBD9'],
  Closed: ['#575145', '#F0ECDF'],
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function moneyRound(n: number) {
  return `₹${Math.round(n).toLocaleString()}`
}

/** Loads all clients via `listClients()`; supports search, status filter, and sort; "Add Client" navigates to `/clients/new`. */
export default function ClientsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Statuses')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Newest')
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>((location.state as { toast?: string } | null)?.toast ?? null)
  const [payLoadingId, setPayLoadingId] = useState<number | null>(null)

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoading(false))
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function openRecordPayment(c: ClientSummary) {
    setPayLoadingId(c.id)
    try {
      const invoices = await listInvoices()
      const unpaid = invoices.find((inv) => inv.client === c.full_name && inv.payment_status !== 'Paid')
      if (unpaid) navigate(`/billing/invoices/${unpaid.id}/record-payment`, { state: { from: '/clients' } })
      else showToast('No outstanding invoice found for this client.')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load invoices.')
    } finally {
      setPayLoadingId(null)
    }
  }

  useEffect(() => {
    if (!toast) return
    window.history.replaceState({}, '')
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

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
          {statCards.map((s) => {
            const lit = s.highlight || hoveredCard === s.label
            return (
            <div
              key={s.label}
              className={styles.statCard}
              style={lit ? { background: '#F3EBD9', border: '1px solid #EAD49B' } : undefined}
              onMouseEnter={() => setHoveredCard(s.label)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div
                style={{
                  width: 42, height: 42, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: lit ? PRIMARY_DARK : '#E6E0CE',
                  transition: 'background .15s',
                }}
              >
                <Icon name={s.icon} size={18} color={lit ? '#FCFAF4' : '#1A2551'} />
              </div>
              <div className={styles.statValue} style={{ fontSize: 26, marginTop: 4 }}>{String(s.value).padStart(2, '0')}</div>
              <div className={styles.statLabel} style={{ fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em' }}>{s.label}</div>
            </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 3, border: '1px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }}
          />
          <Dropdown value={statusFilter} options={STATUSES} labelFor={(s) => s} onChange={setStatusFilter} />
          <Dropdown value={sort} options={[...SORTS]} labelFor={(s) => `Sort By: ${s}`} onChange={(v) => setSort(v as (typeof SORTS)[number])} />
          <div className={styles.primaryChip} onClick={() => navigate('/clients/new')}><Icon name="plus" size={15} color="#FCFAF4" /> Add Client</div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading clients…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((c) => {
              const [color, bg] = STATUS_STYLE_MAP[c.status] || ['#575145', '#F0ECDF']
              return (
                <div key={c.id} style={{ background: '#FCFAF4', border: '1px solid #CFC6B0', borderRadius: 3, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#F3EBD9', color: PRIMARY_DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, fontFamily: "'Spectral', serif", flexShrink: 0 }}>
                    {initialsOf(c.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Spectral', serif", fontSize: 13.5, fontWeight: 600, color: '#1A1A17' }}>{c.full_name}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{c.email}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#8C857A', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em' }}>Status</div>
                    <span className={styles.statusBadge} style={{ color, background: bg, marginTop: 2 }}>{c.status}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#8C857A', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em' }}>Active Cases</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17', marginTop: 2 }}>{c.active_cases}</div>
                  </div>
                  {c.pending_amount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: '#B3282D', background: '#F7E4E5', borderRadius: 3, padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      <Icon name="alert-triangle" size={12} color="#B3282D" />{moneyRound(c.pending_amount)} PENDING
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div onClick={() => navigate(`/clients/${c.id}`)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #CFC6B0', background: '#FCFAF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, cursor: 'pointer' }} title="View client">
                      <Icon name="eye" size={14} />
                    </div>
                    <a href={`mailto:${c.email}`} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #CFC6B0', background: '#FCFAF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, textDecoration: 'none' }} title="Email">
                      <Icon name="mail" size={14} />
                    </a>
                    <div
                      onClick={() => c.pending_amount > 0 && payLoadingId === null && openRecordPayment(c)}
                      style={{
                        width: 30, height: 30, borderRadius: '50%', border: '1px solid #CFC6B0', background: '#FCFAF4',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED,
                        cursor: c.pending_amount > 0 ? 'pointer' : 'default',
                        opacity: c.pending_amount === 0 ? 0.4 : payLoadingId === c.id ? 0.5 : 1,
                      }}
                      title={c.pending_amount > 0 ? 'Record Payment' : 'No outstanding balance'}
                    >
                      <Icon name="banknote" size={14} />
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #CFC6B0', background: '#FCFAF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, cursor: 'default' }} title="Client schedule coming soon">
                      <Icon name="calendar" size={14} />
                    </div>
                  </div>
                  <div className={styles.darkBtn} onClick={() => navigate(`/clients/${c.id}`)} title="View client">DETAILS</div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ color: MUTED, fontSize: 13.5, textAlign: 'center', padding: '24px 0' }}>No clients found.</div>
            )}
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </div>
  )
}
