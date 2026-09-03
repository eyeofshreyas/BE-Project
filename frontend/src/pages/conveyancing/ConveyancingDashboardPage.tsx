/** `/conveyancing` route: role-dispatches to `StaffConveyancingView` (lawyer/admin) or `ClientConveyancingView`, both driven by `getConveyancingSummary()`. */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getConveyancingSummary, listAllMeetings } from '../../api/client'
import type { ConveyancingSummary, MeetingSummary, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate as formatDateWith } from '../../utils/date'
import styles from './ConveyancingDashboardPage.module.css'

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const PRIMARY = '#B08D3E'
const PRIMARY_DARK = '#8f6743'
const MUTED = '#8C7C5E'

const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: PRIMARY_DARK, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const BriefcaseIcon = () => <svg {...iconProps}><rect x={2} y={7} width={20} height={14} rx={2} /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
const ClockIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={10} /><polyline points="12 6 12 12 16 14" /></svg>
const CheckCircleIcon = () => <svg {...iconProps}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
const CalendarIcon = () => <svg {...iconProps}><rect x={3} y={4} width={18} height={18} rx={2} /><line x1={16} y1={2} x2={16} y2={6} /><line x1={8} y1={2} x2={8} y2={6} /><line x1={3} y1={10} x2={21} y2={10} /></svg>
const FilterIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
const PlusIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><line x1={12} y1={5} x2={12} y2={19} /><line x1={5} y1={12} x2={19} y2={12} /></svg>
const ChevronRightIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>

const DONUT_COLORS = [PRIMARY, '#D9822B', '#4CAF50', '#5C8AB0', '#9E5CB0', '#B05C5C']

const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  'Documents Pending': ['#B87F1E', '#FFF2E0'],
  Drafting: ['#6A5C42', '#EFEAE1'],
  Lodged: ['#2E9E58', '#E4F5EA'],
  Completed: ['#2E9E58', '#E4F5EA'],
  Registered: ['#2E9E58', '#E4F5EA'],
  'In Progress': ['#B87F1E', '#FFF2E0'],
  'Registration Scheduled': ['#6A5C42', '#EFEAE1'],
  Pending: ['#B87F1E', '#FFF2E0'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#6A5C42', '#EFEAE1']

const QUICK_ACTIONS = ['Schedule Registration', 'Upload Documents', 'Request Settlement Funds']
const MATTERS_PAGE_SIZE = 6

function relativeDateTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}

function formatDate(iso: string) {
  return formatDateWith(iso, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Reads the session profile and renders `ClientConveyancingView` for clients, `StaffConveyancingView` otherwise. */
export default function ConveyancingDashboardPage() {
  const profile = loadProfile()
  if (profile?.role_id === 3) return <ClientConveyancingView />
  return <StaffConveyancingView />
}

/**
 * Loads `getConveyancingSummary()` (stats, status donut, matters list) and
 * `listAllMeetings()` (for upcoming appointments); supports matter
 * search/type/status filtering with pagination, and an "Add New Matter"
 * button that navigates to `/conveyancing/matters/new`.
 */
function StaffConveyancingView() {
  const navigate = useNavigate()
  const location = useLocation()
  const [toast, setToast] = useState<string | null>((location.state as { toast?: string } | null)?.toast ?? null)
  const [summary, setSummary] = useState<ConveyancingSummary | null>(null)
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)

  useEffect(() => {
    getConveyancingSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load conveyancing data.'))
      .finally(() => setLoading(false))
    listAllMeetings().then(setMeetings).catch(() => {})
  }, [])

  useEffect(() => {
    if (!toast) return
    window.history.replaceState({}, '')
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  function fireAction(label: string) {
    setToast(`${label}…`)
    setTimeout(() => setToast(null), 1800)
  }

  const total = summary?.status_breakdown.reduce((sum, s) => sum + s.count, 0) ?? 0
  let donutAcc = 0
  const donutStops = summary && total > 0
    ? summary.status_breakdown.map((s, i) => {
        const pct = (s.count / total) * 100
        const start = donutAcc
        donutAcc += pct
        return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${start}% ${donutAcc}%`
      }).join(', ')
    : '#E7DCC6 0% 100%'

  const statCards = summary ? [
    { label: 'Active Matters', value: String(summary.stats.active_matters), icon: <BriefcaseIcon /> },
    { label: 'Pending Reg.', value: String(summary.stats.pending_registrations), icon: <ClockIcon /> },
    { label: 'Completed Reg.', value: String(summary.stats.completed_registrations), icon: <CheckCircleIcon /> },
    { label: 'Upcoming Appts', value: String(summary.stats.upcoming_appointments), icon: <CalendarIcon /> },
  ] : []

  const upcomingMeetings = [...meetings]
    .filter((m) => new Date(m.meeting_date).getTime() >= Date.now())
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
    .slice(0, 5)

  const matters = summary?.recent_matters ?? []
  const matterTypes = ['All', ...new Set(matters.map((m) => m.type))]
  const matterStatuses = ['All', ...new Set(matters.map((m) => m.status))]
  const searchLower = search.toLowerCase()
  const filteredMatters = matters.filter((m) =>
    (typeFilter === 'All' || m.type === typeFilter) &&
    (statusFilter === 'All' || m.status === statusFilter) &&
    (!searchLower || m.number.toLowerCase().includes(searchLower) || (m.client ?? '').toLowerCase().includes(searchLower))
  )
  const totalPages = Math.max(1, Math.ceil(filteredMatters.length / MATTERS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * MATTERS_PAGE_SIZE
  const pagedMatters = filteredMatters.slice(pageStart, pageStart + MATTERS_PAGE_SIZE)

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Conveyancing Dashboard</div>
            <div className={styles.subtitle}>Today's conveyancing metrics and critical tasks.</div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.ghostChip}><FilterIcon /><span>Filter</span></div>
            <div className={styles.primaryChip} onClick={() => navigate('/conveyancing/matters/new')}><PlusIcon /><span>Add New Matter</span></div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading conveyancing data…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {summary && (
          <>
            <div className={styles.topGrid}>
              <div className={styles.statCards}>
                {statCards.map((s) => (
                  <div key={s.label} className={styles.statCard}>
                    <div className={styles.statIconRow}><div className={styles.statIconWrap}>{s.icon}</div></div>
                    <div>
                      <div className={styles.statValue}>{s.value}</div>
                      <div className={styles.statLabel}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.donutCard}>
                <div className={styles.donut} style={{ background: `conic-gradient(${donutStops})` }}>
                  <div className={styles.donutHole}>
                    <div className={styles.donutTotal}>{total}</div>
                    <div className={styles.donutTotalLabel}>Total</div>
                  </div>
                </div>
                <div className={styles.legendCol}>
                  <div className={styles.legendTitle}>Status Breakdown</div>
                  <div className={styles.legendList}>
                    {summary.status_breakdown.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No matters yet.</div>}
                    {summary.status_breakdown.map((s, i) => (
                      <div key={s.label} className={styles.legendRow}><span className={styles.legendDot} style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />{s.label} ({s.count})</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Quick Actions</div>
                <div className={styles.quickActionsList}>
                  {QUICK_ACTIONS.map((label) => (
                    <div key={label} className={styles.quickAction} onClick={() => fireAction(label)}>
                      <span>{label}</span><ChevronRightIcon />
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Upcoming Appointments</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {upcomingMeetings.map((m, i) => (
                    <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: i === 0 ? PRIMARY_DARK : 'transparent', border: `2px solid ${PRIMARY_DARK}` }} />
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: PRIMARY_DARK }}>{relativeDateTime(m.meeting_date)}</div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118', marginTop: 2 }}>{m.meeting_title ?? m.case_number ?? 'Meeting'}</div>
                        {m.case_number && <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{m.case_number}</div>}
                      </div>
                    </div>
                  ))}
                  {upcomingMeetings.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No upcoming appointments.</div>}
                </div>
              </div>
            </div>

            <div>
              <div className={styles.sectionTitle}>Conveyancing Matters</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Manage all property registration matters</div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Search by number or client..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
              />
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13, background: '#FFFFFF' }}>
                {matterTypes.map((t) => <option key={t} value={t}>{t === 'All' ? 'All Matter Types' : t}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13, background: '#FFFFFF' }}>
                {matterStatuses.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
              </select>
              <div className={styles.primaryChip} onClick={() => navigate('/conveyancing/matters/new')}><PlusIcon /><span>New Matter</span></div>
            </div>

            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Matter Number</th>
                    <th className={styles.th}>Title</th>
                    <th className={styles.th}>Client</th>
                    <th className={styles.th}>Matter Type</th>
                    <th className={styles.th}>Reg Date</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMatters.map((m) => {
                    const [color, bg] = STATUS_STYLE_MAP[m.status] || DEFAULT_STATUS_STYLE
                    return (
                      <tr key={m.matter_id} className={styles.tr}>
                        <td className={styles.tdMono}>{m.number}</td>
                        <td className={styles.tdClient}>{m.title}</td>
                        <td className={styles.td}>{m.client ?? '—'}</td>
                        <td className={styles.td}>{m.type}</td>
                        <td className={styles.td}>{m.reg_date ? formatDate(m.reg_date) : 'TBD'}</td>
                        <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{m.status}</span></td>
                        <td className={styles.td}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            {m.case_id ? (
                              <div onClick={() => navigate(`/cases/${m.case_id}`)} style={{ cursor: 'pointer', display: 'flex' }} title="View case"><Icon name="eye" size={16} color="#6A5C42" /></div>
                            ) : <span style={{ width: 16 }} />}
                            <div style={{ cursor: 'default', display: 'flex', opacity: .4 }} title="Editing matters coming soon"><Icon name="edit" size={16} color="#6A5C42" /></div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {pagedMatters.length === 0 && (
                    <tr><td className={styles.td} colSpan={7} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No conveyancing matters match your filters.</td></tr>
                  )}
                </tbody>
              </table>
              {filteredMatters.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '1px solid #E7DCC6' }}>
                  <span style={{ fontSize: 12.5, color: MUTED }}>Showing {pageStart + 1} to {Math.min(pageStart + MATTERS_PAGE_SIZE, filteredMatters.length)} of {filteredMatters.length} entries</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div className={styles.ghostChip} style={{ padding: '6px 12px', opacity: currentPage === 1 ? .5 : 1, cursor: currentPage === 1 ? 'default' : 'pointer' }} onClick={() => currentPage > 1 && setPage(currentPage - 1)}>Previous</div>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <div key={p} onClick={() => setPage(p)} style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: p === currentPage ? PRIMARY_DARK : 'transparent', color: p === currentPage ? '#FFFFFF' : '#6A5C42' }}>{p}</div>
                    ))}
                    <div className={styles.ghostChip} style={{ padding: '6px 12px', opacity: currentPage === totalPages ? .5 : 1, cursor: currentPage === totalPages ? 'default' : 'pointer' }} onClick={() => currentPage < totalPages && setPage(currentPage + 1)}>Next</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}

      </div>
    </div>
  )
}

/** Client's own conveyancing matters: loads `getConveyancingSummary()` and renders stat cards + a read-only matters table (row links to `/cases/:caseId` when linked). */
function ClientConveyancingView() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<ConveyancingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getConveyancingSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load conveyancing data.'))
      .finally(() => setLoading(false))
  }, [])

  const statCards = summary ? [
    { label: 'Active Matters', value: summary.stats.active_matters, sublabel: 'In progress', icon: 'briefcase' as const },
    { label: 'Pending Registrations', value: summary.stats.pending_registrations, sublabel: 'Awaiting slot', icon: 'bar-chart-2' as const },
    { label: 'Completed', value: summary.stats.completed_registrations, sublabel: 'All time', icon: 'check-circle' as const },
    { label: 'Upcoming Appointments', value: summary.stats.upcoming_appointments, sublabel: 'This week', icon: 'calendar' as const },
  ] : []

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>My Conveyancing Matters</div>
            <div className={styles.subtitle}>Track the progress of your property registration matters.</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading conveyancing data…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {summary && (
          <>
            <div className={styles.statCards}>
              {statCards.map((s) => (
                <div key={s.label} className={styles.statCard}>
                  <div className={styles.statIconRow}><div className={styles.statIconWrap}><Icon name={s.icon} size={18} color={PRIMARY_DARK} /></div></div>
                  <div>
                    <div className={styles.statValue}>{s.value}</div>
                    <div className={styles.statLabel}>{s.label}</div>
                    <div style={{ fontSize: 11.5, color: '#B08D3E', fontWeight: 600, marginTop: 4 }}>{s.sublabel}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.tableCard}>
              <div className={styles.tableHead}>
                <div className={styles.tableHeadTitle}>Current Matters</div>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Matter No.</th>
                    <th className={styles.th}>Title</th>
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>Property</th>
                    <th className={styles.th}>Lawyer</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent_matters.map((m) => {
                    const [color, bg] = STATUS_STYLE_MAP[m.status] || DEFAULT_STATUS_STYLE
                    return (
                      <tr key={m.matter_id} className={styles.tr}>
                        <td className={styles.tdMono}>{m.number}</td>
                        <td className={styles.tdClient}>{m.title}</td>
                        <td className={styles.td}>{m.type}</td>
                        <td className={styles.td}>{m.property ?? '—'}</td>
                        <td className={styles.td}>{m.lawyer ?? '—'}</td>
                        <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{m.status}</span></td>
                        <td className={styles.td}>
                          {m.case_id ? (
                            <span className={styles.viewAll} onClick={() => navigate(`/cases/${m.case_id}`)}>View Details</span>
                          ) : (
                            <span style={{ color: MUTED, fontSize: 12.5 }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {summary.recent_matters.length === 0 && (
                    <tr><td className={styles.td} colSpan={7} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No conveyancing matters yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
