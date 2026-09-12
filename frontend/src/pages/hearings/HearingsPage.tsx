/** `/hearings` route: role-dispatches to `StaffHearingsView` (list/month toggle, cancel action) or `ClientHearingsView` (read-only calendar). Shares `buildMonthCells()` for the calendar grid. */
import { useEffect, useMemo, useState } from 'react'
import { listHearings, updateHearingStatus } from '../../api/client'
import type { HearingSummary, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#6E6759'
const PRIMARY = '#23306B'
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Scheduled: ['#8A6A2F', '#F3EBD9'],
  Completed: ['#4A6B4E', '#E4EDE5'],
  Adjourned: ['#575145', '#F0ECDF'],
  Cancelled: ['#B3282D', '#F7E4E5'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#575145', '#F0ECDF']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

const PRIORITY_COLORS: Record<string, string> = { High: '#B3282D', Medium: '#8A6A2F', Low: '#4A6B4E' }

function daysFromToday(dateStr: string) {
  const diff = Math.round((new Date(dateStr).getTime() - new Date(isoDate(new Date())).getTime()) / 86400000)
  return diff
}

/** Builds a padded (Sun-start) grid of day numbers for `viewDate`'s month, plus its label, for the month-view calendar in both `StaffHearingsView` and `ClientHearingsView`. */
function buildMonthCells(viewDate: Date) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = new Date(year, month, 1).getDay()
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const trailingEmpty = (7 - (cells.length % 7)) % 7
  while (cells.length % 7 !== 0) cells.push(null)
  return { year, month, monthLabel, cells, trailingEmpty }
}

/** Reads the session profile and renders `ClientHearingsView` for clients, `StaffHearingsView` otherwise. */
export default function HearingsPage() {
  const profile = loadProfile()
  if (profile?.role_id === 3) return <ClientHearingsView />
  return <StaffHearingsView />
}

/** Loads hearings via `listHearings()`; toggles between a List table (with cancel via `updateHearingStatus()`) and a Month calendar grid. */
function StaffHearingsView() {
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'List' | 'Month'>('List')
  const [viewDate, setViewDate] = useState(() => new Date())

  useEffect(() => {
    refresh()
  }, [])

  function refresh() {
    listHearings()
      .then((rows) => setHearings([...rows].sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load hearings.'))
      .finally(() => setLoading(false))
  }

  async function cancelHearing(h: HearingSummary) {
    if (!window.confirm('Cancel this hearing?')) return
    try {
      await updateHearingStatus(h.id, 'Cancelled')
      setHearings((prev) => prev.map((x) => (x.id === h.id ? { ...x, hearing_status: 'Cancelled' } : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel hearing.')
    }
  }

  function jumpToMonth(dateStr: string) {
    setViewDate(new Date(dateStr))
    setView('Month')
  }

  const today = isoDate(new Date())
  const upcoming = hearings.filter((h) => h.hearing_date >= today && h.hearing_status !== 'Cancelled')

  const byDate = useMemo(() => {
    const map = new Map<string, HearingSummary[]>()
    for (const h of hearings) {
      const list = map.get(h.hearing_date) ?? []
      list.push(h)
      map.set(h.hearing_date, list)
    }
    return map
  }, [hearings])
  const { year, month, monthLabel, cells, trailingEmpty } = buildMonthCells(viewDate)

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Calendar</div>
            <div className={styles.subtitle}>All scheduled hearings, synced live from client records.</div>
          </div>
          <div style={{ display: 'flex', gap: 4, background: '#E6E0CE', borderRadius: 3, padding: 4 }}>
            {(['List', 'Month'] as const).map((v) => (
              <div
                key={v}
                onClick={() => setView(v)}
                style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: view === v ? '#FCFAF4' : '#575145', background: view === v ? PRIMARY : 'transparent' }}
              >
                {v}
              </div>
            ))}
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading hearings…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && view === 'List' && (
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>Hearing</th>
                  <th className={styles.th}>Client</th>
                  <th className={styles.th}>Court</th>
                  <th className={styles.th}>Priority</th>
                  <th className={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((h) => {
                  const dayOffset = daysFromToday(h.hearing_date)
                  const label = h.notes || h.case_number || 'Hearing'
                  const priorityColor = h.priority ? PRIORITY_COLORS[h.priority] : undefined
                  return (
                    <tr key={h.id} className={styles.tr}>
                      <td className={styles.td}>
                        {new Date(h.hearing_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{h.hearing_time?.slice(0, 5) ?? '—'} · {dayOffset}d</div>
                      </td>
                      <td className={styles.tdClient}>
                        {label}
                        {h.case_title && <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400, marginTop: 2 }}>{h.case_title}</div>}
                      </td>
                      <td className={styles.td}>{h.client ?? '—'}</td>
                      <td className={styles.td}>{h.court_name ?? '—'}{h.courtroom ? ` - ${h.courtroom}` : ''}</td>
                      <td className={styles.td}>
                        {h.priority && <span className={styles.statusBadge} style={{ color: priorityColor, background: '#F0ECDF' }}>{h.priority}</span>}
                      </td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <div onClick={() => jumpToMonth(h.hearing_date)} style={{ cursor: 'pointer', display: 'flex' }} title="View in calendar"><Icon name="calendar" size={16} color="#575145" /></div>
                          <div onClick={() => cancelHearing(h)} style={{ cursor: 'pointer', display: 'flex' }} title="Cancel hearing"><Icon name="trash-2" size={16} color="#B3282D" /></div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {upcoming.length === 0 && (
                  <tr><td className={styles.td} colSpan={6} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No upcoming hearings.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === 'Month' && (
          <div className={styles.tableCard}>
            <div className={styles.tableHead}>
              <div className={styles.tableHeadTitle}>{monthLabel}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className={styles.calendarNavBtn} onClick={() => setViewDate(new Date(year, month - 1, 1))}>‹</div>
                <div className={styles.calendarNavBtn} onClick={() => setViewDate(new Date(year, month + 1, 1))}>›</div>
              </div>
            </div>
            <div className={styles.calendarGrid}>
              {DOW.map((d) => <div key={d} className={styles.calendarDowCell}>{d}</div>)}
              {cells.map((day, i) => {
                const trailingStart = cells.length - trailingEmpty
                if (trailingEmpty > 0 && i === trailingStart) {
                  return <div key="trailing" style={{ gridColumn: `span ${trailingEmpty}`, background: '#E6E0CE' }} />
                }
                if (day === null) {
                  if (i > trailingStart) return null
                  return <div key={i} className={styles.calendarCell} />
                }
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayHearings = byDate.get(dateKey) ?? []
                const isToday = dateKey === today
                return (
                  <div key={i} className={styles.calendarCell}>
                    <div className={styles.calendarDayNum} style={isToday ? { background: PRIMARY, color: '#FCFAF4' } : {}}>{day}</div>
                    {dayHearings.map((h) => {
                      const [color] = STATUS_STYLE_MAP[h.hearing_status] || DEFAULT_STATUS_STYLE
                      const label = h.notes || h.case_number || 'Hearing'
                      return (
                        <div key={h.id} className={styles.calendarChip} style={{ color }} title={label}>
                          {h.hearing_time?.slice(0, 5)} {label}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Loads hearings via `listHearings()` and renders read-only stat cards plus a month calendar grid (no cancel action). */
function ClientHearingsView() {
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewDate, setViewDate] = useState(() => new Date())

  useEffect(() => {
    listHearings()
      .then((rows) => {
        setHearings(rows)
        // Open on the month of the next hearing, not today's — otherwise "View
        // Upcoming Hearing" lands the client on an empty calendar.
        const next = rows.filter((h) => h.hearing_date >= isoDate(new Date())).sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))[0]
        if (next) setViewDate(new Date(next.hearing_date))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load hearings.'))
      .finally(() => setLoading(false))
  }, [])

  const today = isoDate(new Date())
  const byDate = useMemo(() => {
    const map = new Map<string, HearingSummary[]>()
    for (const h of hearings) {
      const list = map.get(h.hearing_date) ?? []
      list.push(h)
      map.set(h.hearing_date, list)
    }
    return map
  }, [hearings])

  const { year, month, monthLabel, cells, trailingEmpty } = buildMonthCells(viewDate)

  const todaysCount = hearings.filter((h) => h.hearing_date === today).length
  const upcomingCount = hearings.filter((h) => h.hearing_date >= today).length

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.breadcrumb}><span>Dashboard</span><span>›</span><span>Hearings</span></div>

        <div className={styles.header}>
          <div>
            <div className={styles.title}>Hearings</div>
            <div className={styles.subtitle}>Stay informed about your upcoming court hearings, manage reminders, and review schedule details with institutional precision.</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading hearings…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {!loading && (
          <>
            <div className={styles.statCards}>
              <div className={styles.statCard}>
                <div className={styles.statIconRow}><span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Today's Hearings</span><Icon name="calendar" size={16} color={PRIMARY} /></div>
                <div className={styles.statValue}>{String(todaysCount).padStart(2, '0')}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIconRow}><span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Upcoming</span><Icon name="calendar" size={16} color={PRIMARY} /></div>
                <div className={styles.statValue}>{String(upcomingCount).padStart(2, '0')}</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>across {hearings.length} total</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIconRow}><span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Calendar Events</span><Icon name="calendar" size={16} color={PRIMARY} /></div>
                <div className={styles.statValue}>{hearings.length}</div>
              </div>
              <div className={styles.statCard} style={{ border: `1.5px solid ${error ? '#B3282D' : '#23306B'}` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Status</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: error ? '#B3282D' : '#4A6B4E' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: error ? '#B3282D' : '#4A6B4E' }} />
                  {error ? 'Error' : 'Active'}
                </div>
              </div>
            </div>

            <div className={styles.tableCard}>
              <div className={styles.tableHead}>
                <div className={styles.tableHeadTitle}>{monthLabel}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className={styles.calendarNavBtn} onClick={() => setViewDate(new Date(year, month - 1, 1))}>‹</div>
                  <div className={styles.calendarNavBtn} onClick={() => setViewDate(new Date(year, month + 1, 1))}>›</div>
                </div>
              </div>
              <div className={styles.calendarGrid}>
                {DOW.map((d) => <div key={d} className={styles.calendarDowCell}>{d}</div>)}
                {cells.map((day, i) => {
                  const trailingStart = cells.length - trailingEmpty
                  if (trailingEmpty > 0 && i === trailingStart) {
                    return <div key="trailing" style={{ gridColumn: `span ${trailingEmpty}`, background: '#E6E0CE' }} />
                  }
                  if (day === null) {
                    if (i > trailingStart) return null
                    return <div key={i} className={styles.calendarCell} />
                  }
                  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayHearings = byDate.get(dateKey) ?? []
                  const isToday = dateKey === today
                  return (
                    <div key={i} className={styles.calendarCell}>
                      <div className={styles.calendarDayNum} style={isToday ? { background: PRIMARY, color: '#FCFAF4' } : {}}>{day}</div>
                      {dayHearings.map((h) => {
                        const [color] = STATUS_STYLE_MAP[h.hearing_status] || DEFAULT_STATUS_STYLE
                        const label = h.notes || `${h.case_number ?? 'Hearing'}`
                        return (
                          <div key={h.id} className={styles.calendarChip} style={{ color }} title={label}>
                            {h.hearing_time?.slice(0, 5)} {label}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
