/** `/conveyancing` route: role-dispatches to `StaffConveyancingView` (lawyer/admin) or `ClientConveyancingView`, both driven by `getConveyancingSummary()`. */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getConveyancingSummary, listAllMeetings, getMatterDetail, getDocumentDownloadUrl, uploadMatterDocument } from '../../api/client'
import type { ConveyancingSummary, MeetingSummary, UserProfile, MatterDetail } from '../../types/api'
import { Icon } from '../../components/icons'
import DocumentPreviewModal, { isPreviewable } from '../../components/DocumentPreviewModal'
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
const TransferIcon = () => <svg {...iconProps} width={16} height={16}><path d="M4 8h13" /><polyline points="13 4 17 8 13 12" /><path d="M20 16H7" /><polyline points="11 12 7 16 11 20" /></svg>
const KeyIcon = () => <svg {...iconProps} width={16} height={16}><circle cx={8} cy={15} r={4} /><path d="M11 12l9-9" /><path d="M17 6l3 3" /><path d="M14 9l2 2" /></svg>
const CloseIcon = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} /></svg>

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

const FILTER_STATUSES: { label: string; dot: string }[] = [
  { label: 'Drafting', dot: '#6A5C42' },
  { label: 'Pending', dot: '#B87F1E' },
  { label: 'Lodged', dot: '#5C8AB0' },
  { label: 'Completed', dot: '#2E9E58' },
]
const FILTER_MATTER_TYPES: { label: string; icon: React.ReactNode }[] = [
  { label: 'Sale', icon: <Icon name="home" size={16} color="#6A5C42" /> },
  { label: 'Purchase', icon: <Icon name="briefcase" size={16} color="#6A5C42" /> },
  { label: 'Transfer', icon: <TransferIcon /> },
  { label: 'Mortgage', icon: <Icon name="home" size={16} color="#6A5C42" /> },
  { label: 'Lease', icon: <KeyIcon /> },
]
const FILTER_DATE_RANGES = ['Today', 'This Week', 'This Month']
const MATTER_TYPE_OPTIONS = ['Residential Sale', 'Commercial Lease', 'Residential Purchase', 'Off-the-Plan Purchase', 'Mortgage', 'Trust Deed']

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

/** Page numbers to render around `current`, with '...' gaps -- always keeps 1, `total`, and current±1. */
function paginationRange(total: number, current: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, 2, total - 1, total, current - 1, current, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | '...')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('...')
    out.push(p)
  })
  return out
}

/** Chevron-button dropdown styled to match the filter popovers, used for the matter-type/status selects. Exported for reuse by ClientsPage. */
export function Dropdown({ value, options, labelFor, onChange }: { value: string; options: string[]; labelFor: (v: string) => string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <div className={styles.dropdownBtn} onClick={() => setOpen((o) => !o)}>
        <span>{labelFor(value)}</span>
        <Icon name="chevron-down" size={13} color={MUTED} />
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className={styles.dropdownMenu}>
            {options.map((o) => (
              <div
                key={o}
                className={styles.dropdownItem}
                style={{ fontWeight: value === o ? 700 : 500 }}
                onClick={() => { onChange(o); setOpen(false) }}
              >
                {labelFor(o)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
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
 * search/type/status filtering with pagination, a "New Matter" button
 * that navigates to `/conveyancing/matters/new`, and a "Filter" popover
 * (status/matter type feed the real search filters; priority/date
 * created are display-only, matters carry no such fields yet).
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

  const [filterOpen, setFilterOpen] = useState(false)
  const [draftStatus, setDraftStatus] = useState('All')
  const [draftType, setDraftType] = useState('All')
  const [draftPriority, setDraftPriority] = useState<'Low' | 'Medium' | 'High'>('Medium')
  const [draftDateRange, setDraftDateRange] = useState<string | null>(null)

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

  function openFilters() {
    setDraftStatus(statusFilter)
    setDraftType(typeFilter)
    setFilterOpen(true)
  }

  function clearFilters() {
    setDraftStatus('All')
    setDraftType('All')
    setDraftPriority('Medium')
    setDraftDateRange(null)
  }

  function applyFilters() {
    setStatusFilter(draftStatus)
    setTypeFilter(draftType)
    setPage(1)
    setFilterOpen(false)
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

  const matters = summary?.recent_matters ?? []
  const conveyancingCaseIds = new Set(matters.map((m) => m.case_id).filter((id): id is number => id != null))
  const upcomingMeetings = [...meetings]
    .filter((m) => conveyancingCaseIds.has(m.case_id) && new Date(m.meeting_date).getTime() >= Date.now())
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
    .slice(0, 5)

  const matterTypes = ['All', ...new Set([...MATTER_TYPE_OPTIONS, ...matters.map((m) => m.type)])]
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
          <div className={styles.headerActions} style={{ position: 'relative' }}>
            <div className={styles.ghostChip} onClick={openFilters}><FilterIcon /><span>Filter</span></div>
            <div className={styles.primaryChip} onClick={() => navigate('/conveyancing/matters/new')}><PlusIcon /><span>New Matter</span></div>

            {filterOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setFilterOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, width: 380, background: '#FFFBF2', borderRadius: 20, boxShadow: '0 20px 48px rgba(0,0,0,.18)', padding: 22, zIndex: 41 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, fontWeight: 700, color: '#2A2118' }}>Filters</div>
                      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Refine your view</div>
                    </div>
                    <div onClick={() => setFilterOpen(false)} style={{ cursor: 'pointer', padding: 2 }}><CloseIcon /></div>
                  </div>
                  <div style={{ height: 1, background: '#E7DCC6', margin: '14px 0' }} />

                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Status</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                    <div
                      onClick={() => setDraftStatus('All')}
                      style={{ padding: '7px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: draftStatus === 'All' ? '#FFFFFF' : '#6A5C42', background: draftStatus === 'All' ? PRIMARY_DARK : '#FFFFFF', border: `1px solid ${draftStatus === 'All' ? PRIMARY_DARK : '#E7DCC6'}` }}
                    >
                      All
                    </div>
                    {FILTER_STATUSES.map((s) => (
                      <div
                        key={s.label}
                        onClick={() => setDraftStatus(s.label)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: draftStatus === s.label ? '#FFFFFF' : '#6A5C42', background: draftStatus === s.label ? PRIMARY_DARK : '#FFFFFF', border: `1px solid ${draftStatus === s.label ? PRIMARY_DARK : '#E7DCC6'}` }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: draftStatus === s.label ? '#FFFFFF' : s.dot }} />{s.label}
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Matter Type</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 }}>
                    {FILTER_MATTER_TYPES.map((t) => {
                      const selected = draftType === t.label
                      return (
                        <div
                          key={t.label}
                          onClick={() => setDraftType(selected ? 'All' : t.label)}
                          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: selected ? '#FBF0D6' : '#FFFFFF', border: `1.5px solid ${selected ? '#B08D3E' : '#E7DCC6'}` }}
                        >
                          {t.icon}
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#2A2118' }}>{t.label}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Priority</div>
                  <div style={{ display: 'flex', gap: 6, background: '#F1E9D6', borderRadius: 9, padding: 4, marginBottom: 18 }}>
                    {(['Low', 'Medium', 'High'] as const).map((p) => (
                      <div key={p} onClick={() => setDraftPriority(p)} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: draftPriority === p ? '#2A2118' : MUTED, background: draftPriority === p ? '#FFFFFF' : 'transparent' }}>
                        {p}
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Date Created</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    {FILTER_DATE_RANGES.map((d) => (
                      <div
                        key={d}
                        onClick={() => setDraftDateRange(draftDateRange === d ? null : d)}
                        style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: draftDateRange === d ? '#FFFFFF' : '#6A5C42', background: draftDateRange === d ? PRIMARY_DARK : '#FFFFFF', border: `1px solid ${draftDateRange === d ? PRIMARY_DARK : '#E7DCC6'}` }}
                      >
                        {d}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div onClick={clearFilters} style={{ fontSize: 12.5, fontWeight: 600, color: MUTED, cursor: 'pointer' }}>Clear All</div>
                    <div className={styles.primaryChip} onClick={applyFilters}>Apply Filters</div>
                  </div>
                </div>
              </>
            )}
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
              <Dropdown
                value={typeFilter}
                options={matterTypes}
                labelFor={(t) => (t === 'All' ? 'All Matter Types' : t)}
                onChange={(v) => { setTypeFilter(v); setPage(1) }}
              />
              <Dropdown
                value={statusFilter}
                options={matterStatuses}
                labelFor={(s) => (s === 'All' ? 'All Statuses' : s)}
                onChange={(v) => { setStatusFilter(v); setPage(1) }}
              />
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
                    <th className={styles.th}>Actions</th>
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
                    {paginationRange(totalPages, currentPage).map((p, i) =>
                      p === '...' ? (
                        <div key={`gap-${i}`} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: MUTED }}>…</div>
                      ) : (
                        <div key={p} onClick={() => setPage(p)} style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: p === currentPage ? PRIMARY_DARK : 'transparent', color: p === currentPage ? '#FFFFFF' : '#6A5C42' }}>{p}</div>
                      )
                    )}
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
  const [summary, setSummary] = useState<ConveyancingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedMatterId, setSelectedMatterId] = useState<number | null>(null)

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
                          <span className={styles.viewAll} onClick={() => setSelectedMatterId(m.matter_id)}>View Details</span>
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

      {selectedMatterId != null && (
        <MatterDetailModal matterId={selectedMatterId} onClose={() => setSelectedMatterId(null)} />
      )}
    </div>
  )
}

/** Builds the Overview description from real matter/property/progress fields -- there's no free-text description column, so this reads as one. */
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

/**
 * "View Details" popup opened from a client's conveyancing matter row. Loads full detail
 * via `getMatterDetail()`: overview, property, registration-progress stepper, and shared
 * documents (preview/download via the existing document endpoints, upload via
 * `uploadMatterDocument()` -- appends the new doc to `matter.documents` on success).
 */
function MatterDetailModal({ matterId, onClose }: { matterId: number; onClose: () => void }) {
  const [matter, setMatter] = useState<MatterDetail | null>(null)
  const [error, setError] = useState('')
  const [previewDoc, setPreviewDoc] = useState<{ id: number; fileName: string; mimeType: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getMatterDetail(matterId)
      .then(setMatter)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this matter.'))
  }, [matterId])

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={onClose}>
      <div style={{ background: '#FCF9F3', borderRadius: 18, width: 'min(880px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 26, boxShadow: '0 20px 48px rgba(0,0,0,.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 19, fontWeight: 700, color: '#2A2118' }}>
            Matter Details{matter ? `: ${matter.matter_number}` : ''}
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', display: 'flex' }}><Icon name="x" size={18} color={MUTED} /></span>
        </div>

        {!matter && !error && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading matter…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {matter && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Overview</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Description</div>
                <div style={{ fontSize: 13.5, color: '#2A2118', marginTop: 6, lineHeight: 1.5 }}>{matterDescription(matter)}</div>
                <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Initiated</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118', marginTop: 4 }}>{matter.created_at ? formatDate(matter.created_at) : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Target Completion</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118', marginTop: 4 }}>{matter.expected_completion_date ? formatDate(matter.expected_completion_date) : '—'}</div>
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
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #F1E9D9', fontSize: 13.5 }}>
                      <div style={{ color: MUTED }}>{label}</div>
                      <div style={{ fontWeight: 700, color: '#2A2118' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className={styles.panelCard}>
                <div className={styles.panelTitle}>Registration Progress</div>
                <div className={styles.timeline}>
                  {matter.progress.map((s) => (
                    <div key={s.progress_id} className={styles.timelineItem}>
                      <span className={styles.timelineDot} style={{ background: s.completed ? PRIMARY_DARK : '#FFFFFF', border: `2px solid ${PRIMARY_DARK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {s.completed && <Icon name="check-circle" size={9} color="#FFFFFF" strokeWidth={3} />}
                      </span>
                      <div className={styles.timelineTitle} style={{ fontWeight: 700 }}>{s.stage_name}</div>
                      <div className={styles.timelineMeta}>{s.completed ? (s.completed_at ? formatDate(s.completed_at) : 'Completed') : 'Pending'}</div>
                    </div>
                  ))}
                  {matter.progress.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No progress stages yet.</div>}
                </div>
              </div>

              <div className={styles.panelCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div className={styles.panelTitle} style={{ marginBottom: 0 }}>Shared Documents</div>
                  <div className={styles.primaryChip} style={{ opacity: uploading ? .6 : 1, cursor: uploading ? 'default' : 'pointer' }} onClick={() => !uploading && fileInputRef.current?.click()}>
                    <Icon name="upload-cloud" size={15} color="#FFFFFF" /> {uploading ? 'Uploading…' : 'Upload Requested Document'}
                  </div>
                  <input ref={fileInputRef} type="file" onChange={handleFileChosen} style={{ display: 'none' }} />
                </div>
                {uploadError && <div style={{ color: '#B05C5C', fontSize: 12.5, marginBottom: 10 }}>{uploadError}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {matter.documents.map((d) => (
                    <div key={d.matter_document_id} style={{ padding: '10px 14px', border: '1px solid #E7DCC6', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icon name="file-text" size={17} color={MUTED} />
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>{d.file_name ?? 'Document'}</div>
                        <span className={styles.statusBadge} style={d.is_verified ? { color: '#2E9E58', background: '#E4F5EA' } : { color: '#B87F1E', background: '#FFF2E0' }}>
                          {d.is_verified ? 'Verified' : d.is_required ? 'Required' : 'Pending'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                        <span
                          style={{ fontSize: 12.5, fontWeight: 600, color: '#B08D3E', cursor: 'pointer' }}
                          onClick={() => (d.mime_type && isPreviewable(d.mime_type) ? setPreviewDoc({ id: d.document_id, fileName: d.file_name ?? 'Document', mimeType: d.mime_type }) : downloadDoc(d.document_id))}
                        >
                          Preview
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#B08D3E', cursor: 'pointer' }} onClick={() => downloadDoc(d.document_id)}>Download</span>
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

      {previewDoc && (
        <DocumentPreviewModal
          documentId={previewDoc.id}
          fileName={previewDoc.fileName}
          mimeType={previewDoc.mimeType}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  )
}
