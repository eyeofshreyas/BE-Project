/** `/cases` route: role-dispatches to `StaffCasesView` (lawyer/admin, filterable table) or `ClientCasesView` (client, stats + progress cards). */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCases, listHearings, listCaseTimeline } from '../../api/client'
import type { CaseSummary, HearingSummary, TimelineEvent, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate, timeAgo } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const CLOSED_STATUSES = new Set(['Closed', 'Completed'])
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Completed: ['#2E9E58', '#E4F5EA'],
  Closed: ['#2E9E58', '#E4F5EA'],
  Open: ['#B87F1E', '#FFF2E0'],
  'In Progress': ['#B87F1E', '#FFF2E0'],
  Pending: ['#B87F1E', '#FFF2E0'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#6A5C42', '#EFEAE1']
const FILTERS = ['All', 'Active', 'Pending', 'Closed']
const ACTIVE_STATUSES = new Set(['Open', 'In Progress'])

function matchesFilter(status: string, filter: string) {
  if (filter === 'All') return true
  if (filter === 'Active') return ACTIVE_STATUSES.has(status)
  if (filter === 'Pending') return status === 'Pending'
  if (filter === 'Closed') return CLOSED_STATUSES.has(status)
  return true
}

// ponytail: same status->progress approximation used on the client dashboard --
// litigation cases have no real stage tracking, only conveyancing matters do.
const STATUS_PROGRESS: Record<string, number> = {
  Closed: 100, Completed: 100, 'In Progress': 60, Open: 35, Pending: 15,
}

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Same role-based split pattern as DashboardPage.tsx: one route, two
// completely different views (client sees their own cases read-only,
// lawyer/admin get filters, bulk actions, and "New Case").
export default function CasesListPage() {
  const profile = loadProfile()
  if (profile?.role_id === 3) return <ClientCasesView />
  return <StaffCasesView />
}

/** Loads all cases via `listCases()`; supports search + status-tab filtering; row click and "New Case" navigate to `/cases/:caseId` and `/cases/new`. */
function StaffCasesView() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  useEffect(() => {
    listCases()
      .then(setCases)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load cases.'))
      .finally(() => setLoading(false))
  }, [])

  const searchLower = search.toLowerCase()
  const filtered = cases.filter((c) => {
    const matchesStatus = matchesFilter(c.status, statusFilter)
    const matchesSearch = !searchLower || c.id.toLowerCase().includes(searchLower) || (c.case_title ?? '').toLowerCase().includes(searchLower) || (c.client ?? '').toLowerCase().includes(searchLower)
    return matchesStatus && matchesSearch
  })
  const activeCount = cases.filter((c) => ACTIVE_STATUSES.has(c.status)).length

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Cases</div>
            <div className={styles.subtitle}>{cases.length} total · {activeCount} active</div>
          </div>
          <div className={styles.primaryChip} onClick={() => navigate('/cases/new')}><Icon name="plus" size={15} color="#FFFFFF" /> New Case</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input
            placeholder="Search by case name, client, or number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240, padding: '9px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
          />
          <div style={{ display: 'flex', gap: 4, background: '#EFE4CB', borderRadius: 10, padding: 4 }}>
            {FILTERS.map((f) => (
              <div
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: statusFilter === f ? '#2A2118' : '#6A5C42', background: statusFilter === f ? '#FFFFFF' : 'transparent' }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading cases…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Case</th>
                  <th className={styles.th}>Client</th>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Next Hearing</th>
                  <th className={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const [color, bg] = STATUS_STYLE_MAP[c.status] || DEFAULT_STATUS_STYLE
                  return (
                    <tr key={c.id} className={styles.tr} onClick={() => navigate(`/cases/${c.case_id}`)}>
                      <td className={styles.tdClient}>
                        <div style={{ fontWeight: 700 }}>{c.case_title ?? c.id}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: '#B08D3E', fontWeight: 500, marginTop: 2 }}>{c.id}</div>
                      </td>
                      <td className={styles.td}>{c.client ?? '—'}</td>
                      <td className={styles.td}>{c.case_type ?? '—'}</td>
                      <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{c.status}</span></td>
                      <td className={styles.td}>{c.hearing ? formatDate(c.hearing) : '—'}</td>
                      <td className={styles.td} style={{ textAlign: 'right' }}><span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><Icon name="chevron-down" size={15} color="#B08D3E" strokeWidth={2.2} /></span></td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td className={styles.td} colSpan={6} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No cases match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Loads the client's cases (`listCases()`), hearings (`listHearings()`) for
 * the "next hearing" stat, and each case's timeline (`listCaseTimeline()`)
 * to build a flattened "Recent Updates" feed. Renders stat cards + a
 * progress-bar card per case.
 */
function ClientCasesView() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [updates, setUpdates] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([listCases(), listHearings()])
      .then(([c, h]) => {
        setCases(c)
        setHearings(h)
        Promise.all(c.map((cs) => listCaseTimeline(cs.case_id).catch(() => [] as TimelineEvent[])))
          .then((lists) => setUpdates(lists.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your cases.'))
      .finally(() => setLoading(false))
  }, [])

  const searchLower = search.toLowerCase()
  const filtered = cases.filter((c) =>
    !searchLower || c.id.toLowerCase().includes(searchLower) || (c.case_title ?? '').toLowerCase().includes(searchLower) || (c.lawyer ?? '').toLowerCase().includes(searchLower)
  )

  const activeCases = cases.filter((c) => !CLOSED_STATUSES.has(c.status))
  const closedCases = cases.filter((c) => CLOSED_STATUSES.has(c.status))
  const scheduledHearings = hearings.filter((h) => h.hearing_status === 'Scheduled')
  const nextHearing = [...scheduledHearings].sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))[0]

  const statCards = [
    { label: 'Total Cases', value: cases.length, sublabel: `${cases.length} on file`, icon: 'briefcase' as const },
    { label: 'Active Cases', value: activeCases.length, sublabel: 'In progress', icon: 'bar-chart-2' as const },
    { label: 'Upcoming Hearings', value: scheduledHearings.length, sublabel: nextHearing ? `Next ${formatDate(nextHearing.hearing_date)}` : 'None scheduled', icon: 'calendar' as const },
    { label: 'Closed Cases', value: closedCases.length, sublabel: 'Resolved', icon: 'check-circle' as const },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>My Cases</div>
            <div className={styles.subtitle}>Track progress across all your active and closed cases.</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading your cases…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.statCards}>
              {statCards.map((s) => (
                <div key={s.label} className={styles.statCard}>
                  <div className={styles.statLabel} style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.03em', fontWeight: 700 }}>{s.label}</div>
                  <div className={styles.statValue}>{String(s.value).padStart(2, '0')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#B08D3E', fontWeight: 600 }}>
                    <Icon name={s.icon} size={13} color="#B08D3E" />{s.sublabel}
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.midGrid}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <input
                  placeholder="Filter by case ID, title or lawyer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
                />
                {filtered.map((c) => {
                  const [color, bg] = STATUS_STYLE_MAP[c.status] || DEFAULT_STATUS_STYLE
                  const pct = STATUS_PROGRESS[c.status] ?? 50
                  return (
                    <div key={c.id} className={styles.panelCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#B08D3E', fontWeight: 600 }}>{c.id}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#2A2118', marginTop: 2 }}>{c.case_title ?? c.id}</div>
                          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{c.court ?? 'Court TBD'}</div>
                        </div>
                        <span className={styles.statusBadge} style={{ color, background: bg, flexShrink: 0 }}>{c.status}</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700 }}>Lead Lawyer</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118', marginTop: 4 }}>{c.lawyer ?? '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10.5, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700 }}>Next Hearing</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118', marginTop: 4 }}>{c.hearing ? formatDate(c.hearing) : '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10.5, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700 }}>Progress</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <div className={styles.progressTrack} style={{ flex: 1 }}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#2A2118' }}>{pct}%</div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <div className={styles.darkBtn} onClick={() => navigate(`/cases/${c.case_id}`)}>View Details →</div>
                      </div>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div className={styles.panelCard} style={{ color: MUTED, textAlign: 'center' }}>No cases match your filter.</div>
                )}
              </div>

              <div className={styles.sideCol}>
                <div className={styles.panelCard}>
                  <div className={styles.panelTitle}>Recent Updates</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {updates.map((u) => (
                      <div key={u.id} style={{ borderTop: '1px solid #F1E9D9', paddingTop: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118' }}>{u.event_title}</div>
                        {u.event_description && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{u.event_description}</div>}
                        <div style={{ fontSize: 11, color: '#A38F66', marginTop: 4 }}>{timeAgo(u.created_at)}</div>
                      </div>
                    ))}
                    {updates.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No recent activity.</div>}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
