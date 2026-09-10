/** `/cases` route: role-dispatches to `StaffCasesView` (lawyer/admin, sortable table) or `ClientCasesView` (client, one card per case). */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCases, listHearings, listCaseTimeline } from '../../api/client'
import type { CaseSummary, HearingSummary, TimelineEvent, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate, timeAgo } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'
import cd from './cases.module.css'

const MUTED = '#6E6759'
const CLOSED_STATUSES = new Set(['Closed', 'Completed'])
const ACTIVE_STATUSES = new Set(['Open', 'In Progress'])
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Completed: ['#4A6B4E', '#E4EDE5'],
  Closed: ['#4A6B4E', '#E4EDE5'],
  Open: ['#8A6A2F', '#F3EBD9'],
  'In Progress': ['#8A6A2F', '#F3EBD9'],
  Pending: ['#8A6A2F', '#F3EBD9'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#575145', '#F0ECDF']
const STATUS_LABELS: Record<string, string> = { Open: 'Active' }
function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s
}

const PRIORITY_COLORS: Record<string, string> = { High: '#B3282D', Medium: '#8A6A2F', Low: '#4A6B4E' }
const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

const FILTERS = ['All', 'Active', 'Pending', 'Closed']

function matchesFilter(status: string, filter: string) {
  if (filter === 'All') return true
  if (filter === 'Active') return ACTIVE_STATUSES.has(status)
  if (filter === 'Pending') return status === 'Pending'
  if (filter === 'Closed') return CLOSED_STATUSES.has(status)
  return true
}

const DAY_MS = 86400000

/** Days from today to `iso`, ignoring clock time -- negative once the date has passed. */
function daysUntil(iso: string) {
  return Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY_MS)
}

/**
 * A hearing date is only useful as a distance: "In 6 days" answers the question
 * a bare "Sep 15, 2026" makes you work out. Beyond a fortnight the date itself
 * is the clearer form, so it takes over.
 */
function hearingLabel(iso: string) {
  const days = daysUntil(iso)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days <= 14) return `In ${days} days`
  return formatDate(iso)
}

function hearingColor(iso: string) {
  const days = daysUntil(iso)
  if (days < 0) return MUTED
  return days <= 7 ? '#8A6A2F' : '#1A1A17'
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
// lawyer/admin get filters, sorting, and "New case").
export default function CasesListPage() {
  const profile = loadProfile()
  if (profile?.role_id === 3) return <ClientCasesView />
  return <StaffCasesView />
}

type SortKey = 'case' | 'client' | 'type' | 'priority' | 'status' | 'hearing'

/** Sort value per column. Cases with no hearing sort to the end of an ascending sort. */
const SORT_VALUES: Record<SortKey, (c: CaseSummary) => string | number> = {
  case: (c) => (c.case_title ?? c.id).toLowerCase(),
  client: (c) => (c.client ?? '').toLowerCase(),
  type: (c) => (c.case_type ?? '').toLowerCase(),
  priority: (c) => PRIORITY_RANK[c.priority] ?? 9,
  status: (c) => statusLabel(c.status),
  hearing: (c) => (c.hearing ? new Date(c.hearing).getTime() : Number.MAX_SAFE_INTEGER),
}

/**
 * Loads all cases via `listCases()`. Search, status tabs and column sorting all
 * filter one list in place; a row or "New case" navigates to `/cases/:caseId`
 * or `/cases/new`. Defaults to the soonest hearing first, which is the order a
 * caseload is actually worked in.
 */
function StaffCasesView() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'hearing', asc: true })

  useEffect(() => {
    listCases()
      .then(setCases)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load cases.'))
      .finally(() => setLoading(false))
  }, [])

  function sortBy(key: SortKey) {
    setSort((prev) => ({ key, asc: prev.key === key ? !prev.asc : true }))
  }

  const searchLower = search.trim().toLowerCase()
  const filtered = cases
    .filter((c) => {
      const matchesStatus = matchesFilter(c.status, statusFilter)
      const matchesSearch = !searchLower || c.id.toLowerCase().includes(searchLower) || (c.case_title ?? '').toLowerCase().includes(searchLower) || (c.client ?? '').toLowerCase().includes(searchLower)
      return matchesStatus && matchesSearch
    })
    .sort((a, b) => {
      const [x, y] = [SORT_VALUES[sort.key](a), SORT_VALUES[sort.key](b)]
      return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1)
    })

  const countFor = (f: string) => cases.filter((c) => matchesFilter(c.status, f)).length

  function SortHead({ label, sortKey, align }: { label: string; sortKey: SortKey; align?: 'right' }) {
    const active = sort.key === sortKey
    return (
      <th className={styles.th} style={align === 'right' ? { textAlign: 'right' } : undefined}>
        <button className={cd.sortHead} style={align === 'right' ? { marginLeft: 'auto' } : undefined} onClick={() => sortBy(sortKey)}>
          {label}
          <span className={`${cd.caret} ${active ? '' : cd.caretOff} ${active && !sort.asc ? cd.caretUp : ''}`}>
            <Icon name="chevron-down" size={12} color="#1A2551" strokeWidth={2.4} />
          </span>
        </button>
      </th>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.title}>Cases</div>
          <div className={styles.primaryChip} onClick={() => navigate('/cases/new')}><Icon name="plus" size={15} color="#FCFAF4" /> New case</div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading cases…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableCard}>
            <div className={cd.toolbar}>
              <div className={cd.searchBox} style={{ flex: 1, minWidth: 240 }}>
                <Icon name="search" size={15} color="#8C857A" />
                <input
                  placeholder="Search by case, client or number…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cd.plainInput}
                />
              </div>
              <div className={cd.tabs}>
                {FILTERS.map((f) => (
                  <button key={f} className={`${cd.tab} ${statusFilter === f ? cd.tabOn : ''}`} onClick={() => setStatusFilter(f)}>
                    {f}<span className={cd.tabCount}>{countFor(f)}</span>
                  </button>
                ))}
              </div>
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <SortHead label="Case" sortKey="case" />
                  <SortHead label="Client" sortKey="client" />
                  <SortHead label="Type" sortKey="type" />
                  <SortHead label="Priority" sortKey="priority" />
                  <SortHead label="Status" sortKey="status" />
                  <SortHead label="Next hearing" sortKey="hearing" align="right" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const [color, bg] = STATUS_STYLE_MAP[c.status] || DEFAULT_STATUS_STYLE
                  return (
                    <tr key={c.id} className={styles.tr} onClick={() => navigate(`/cases/${c.case_id}`)}>
                      <td className={styles.tdClient}>
                        <div style={{ fontWeight: 700 }}>{c.case_title ?? c.id}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#23306B', marginTop: 2 }}>{c.id}</div>
                      </td>
                      <td className={styles.td}>{c.client ?? 'No client'}</td>
                      <td className={styles.td}>{c.case_type ?? '—'}</td>
                      <td className={styles.td}>
                        <span className={cd.priority}>
                          <span className={cd.priorityDot} style={{ background: PRIORITY_COLORS[c.priority] ?? '#C9BC9E' }} />
                          {c.priority}
                        </span>
                      </td>
                      <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{statusLabel(c.status)}</span></td>
                      <td className={styles.td} style={{ textAlign: 'right', color: c.hearing ? hearingColor(c.hearing) : MUTED, fontWeight: c.hearing ? 600 : 400 }}>
                        {c.hearing ? hearingLabel(c.hearing) : 'Not scheduled'}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td className={styles.td} colSpan={6} style={{ padding: '28px 22px' }}>
                      <div className={cd.empty}>
                        {cases.length === 0 ? 'No cases on file yet.' : 'No cases match this search.'}
                      </div>
                      <div className={cd.emptyRow}>
                        {cases.length === 0 ? (
                          <div className={styles.ghostChip} onClick={() => navigate('/cases/new')}><Icon name="plus" size={15} color={MUTED} /> New case</div>
                        ) : (
                          <button className={cd.linkAction} onClick={() => { setSearch(''); setStatusFilter('All') }}>Clear search and filters</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** One labelled fact inside a client case card. */
function CardFact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className={cd.factLabel}>{label}</div>
      <div className={cd.factValue} style={{ fontSize: 13.5, marginTop: 4, color }}>{value}</div>
    </div>
  )
}

/**
 * Loads the client's cases (`listCases()`), hearings (`listHearings()`) for the
 * "next hearing" stat, and each case's timeline (`listCaseTimeline()`) for the
 * latest-activity line and the Recent updates feed. One card per case, each
 * opening the full `/cases/:caseId` page.
 */
function ClientCasesView() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [updates, setUpdates] = useState<TimelineEvent[]>([])
  const [latestByCase, setLatestByCase] = useState<Record<number, TimelineEvent>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([listCases(), listHearings()])
      .then(([c, h]) => {
        setCases(c)
        setHearings(h)
        Promise.all(c.map((cs) => listCaseTimeline(cs.case_id).catch(() => [] as TimelineEvent[])))
          .then((lists) => {
            setUpdates(lists.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6))
            // timeline rows come back newest-first, so index 0 per case is its latest event
            setLatestByCase(Object.fromEntries(lists.filter((l) => l.length > 0).map((l) => [l[0].case_id, l[0]])))
          })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your cases.'))
      .finally(() => setLoading(false))
  }, [])

  const searchLower = search.trim().toLowerCase()
  const filtered = cases.filter((c) =>
    !searchLower || c.id.toLowerCase().includes(searchLower) || (c.case_title ?? '').toLowerCase().includes(searchLower) || (c.lawyer ?? '').toLowerCase().includes(searchLower)
  )

  const activeCases = cases.filter((c) => !CLOSED_STATUSES.has(c.status))
  const closedCases = cases.filter((c) => CLOSED_STATUSES.has(c.status))
  const todayIso = new Date().toISOString().slice(0, 10)
  const scheduledHearings = hearings.filter((h) => h.hearing_status === 'Scheduled' && h.hearing_date >= todayIso)
  const nextHearing = [...scheduledHearings].sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))[0]
  const caseNumbers = Object.fromEntries(cases.map((c) => [c.case_id, c.id]))

  const statCards = [
    { label: 'Cases on file', value: cases.length, sublabel: null, icon: 'briefcase' as const },
    { label: 'Open', value: activeCases.length, sublabel: null, icon: 'bar-chart-2' as const },
    { label: 'Hearings ahead', value: scheduledHearings.length, sublabel: nextHearing ? `Next ${hearingLabel(nextHearing.hearing_date).toLowerCase()}` : null, icon: 'calendar' as const },
    { label: 'Closed', value: closedCases.length, sublabel: null, icon: 'check-circle' as const },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>My cases</div>
            <div className={styles.subtitle}>Where each of your matters stands right now.</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading your cases…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.statCards}>
              {statCards.map((s) => (
                <div key={s.label} className={styles.statCard}>
                  <div className={styles.statIconRow}><div className={styles.statIconWrap}><Icon name={s.icon} size={18} color="#1A2551" /></div></div>
                  <div>
                    <div className={styles.statValue}>{s.value}</div>
                    <div className={styles.statLabel}>{s.label}</div>
                    {s.sublabel && <div style={{ fontSize: 12, color: '#23306B', fontWeight: 600, marginTop: 5 }}>{s.sublabel}</div>}
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.midGrid}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className={cd.searchBox}>
                  <Icon name="search" size={15} color="#8C857A" />
                  <input
                    placeholder="Search your cases…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={cd.plainInput}
                  />
                </div>

                {filtered.map((c) => {
                  const [color, bg] = STATUS_STYLE_MAP[c.status] || DEFAULT_STATUS_STYLE
                  const latest = latestByCase[c.case_id]
                  return (
                    <button key={c.id} className={cd.caseCard} onClick={() => navigate(`/cases/${c.case_id}`)}>
                      <div className={cd.caseCardTop}>
                        <div style={{ minWidth: 0 }}>
                          <div className={cd.caseNumber}>{c.id}</div>
                          <div style={{ fontFamily: "'Spectral', serif", fontSize: 16, fontWeight: 700, color: '#1A1A17', marginTop: 3 }}>{c.case_title ?? c.id}</div>
                          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{c.court ?? 'Court not set'}</div>
                        </div>
                        <span className={styles.statusBadge} style={{ color, background: bg, flexShrink: 0 }}>{statusLabel(c.status)}</span>
                      </div>

                      <div className={cd.caseCardFacts}>
                        <CardFact label="Your lawyer" value={c.lawyer ?? 'Not assigned'} />
                        <CardFact
                          label="Next hearing"
                          value={c.hearing ? hearingLabel(c.hearing) : 'Not scheduled'}
                          color={c.hearing ? hearingColor(c.hearing) : MUTED}
                        />
                        <CardFact label="Filed" value={c.filing_date ? formatDate(c.filing_date) : 'Not recorded'} />
                      </div>

                      {latest && (
                        <div className={cd.activityLine}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#23306B', flexShrink: 0 }} />
                          {latest.event_title}
                          <span style={{ color: '#8C857A' }}>{timeAgo(latest.created_at)}</span>
                        </div>
                      )}
                    </button>
                  )
                })}

                {filtered.length === 0 && (
                  <div className={styles.panelCard}>
                    <div className={cd.empty}>
                      {cases.length === 0 ? 'You have no cases on file yet. Your lawyer opens these for you.' : 'No cases match that search.'}
                    </div>
                    {cases.length > 0 && (
                      <div className={cd.emptyRow}>
                        <button className={cd.linkAction} onClick={() => setSearch('')}>Clear search</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.sideCol}>
                <div className={styles.panelCard}>
                  <div className={styles.panelTitle}>Recent updates</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                    {updates.map((u) => (
                      <div key={u.id} className={cd.updateRow}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#23306B', marginTop: 6, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div className={cd.updateCase}>{caseNumbers[u.case_id] ?? ''}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17', marginTop: 2 }}>{u.event_title}</div>
                          {u.event_description && <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>{u.event_description}</div>}
                          <div style={{ fontSize: 11.5, color: '#8C857A', marginTop: 4 }}>{timeAgo(u.created_at)}</div>
                        </div>
                      </div>
                    ))}
                    {updates.length === 0 && <div className={cd.empty}>Nothing has happened on your cases yet. Filings, hearings and documents show up here.</div>}
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
