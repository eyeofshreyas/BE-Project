/** `/clients` route (lawyer/admin): searchable/sortable/filterable client list. Reads an optional `location.state.toast` (set by `CreateClientPage` after navigating here). */
import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { listClients } from '../../api/client'
import type { ClientSummary } from '../../types/api'
import { Icon } from '../../components/icons'
import { Dropdown } from '../conveyancing/ConveyancingDashboardPage'
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

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoading(false))
  }, [])

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
              style={lit ? { background: '#FBF0D6', border: '1px solid #EAD49B' } : undefined}
              onMouseEnter={() => setHoveredCard(s.label)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div
                style={{
                  width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: lit ? PRIMARY_DARK : '#EFE4CB',
                  transition: 'background .15s',
                }}
              >
                <Icon name={s.icon} size={18} color={lit ? '#FFFFFF' : '#8f6743'} />
              </div>
              <div className={styles.statValue} style={{ fontSize: 26, marginTop: 4 }}>{String(s.value).padStart(2, '0')}</div>
              <div className={styles.statLabel} style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 700, letterSpacing: '.03em' }}>{s.label}</div>
            </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
          />
          <Dropdown value={statusFilter} options={STATUSES} labelFor={(s) => s} onChange={setStatusFilter} />
          <Dropdown value={sort} options={[...SORTS]} labelFor={(s) => `Sort By: ${s}`} onChange={(v) => setSort(v as (typeof SORTS)[number])} />
          <div className={styles.primaryChip} onClick={() => navigate('/clients/new')}><Icon name="plus" size={15} color="#FFFFFF" /> Add Client</div>
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
      </div>
    </div>
  )
}
