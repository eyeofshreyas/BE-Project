import { useEffect, useMemo, useState } from 'react'
import { listHearings } from '../../api/client'
import type { HearingSummary, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const PRIMARY = '#B08D3E'
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Scheduled: ['#B87F1E', '#FFF2E0'],
  Completed: ['#2E9E58', '#E4F5EA'],
  Adjourned: ['#6A5C42', '#EFEAE1'],
  Cancelled: ['#B05C5C', '#FBEAEA'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#6A5C42', '#EFEAE1']
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

export default function HearingsPage() {
  const profile = loadProfile()
  if (profile?.role_id === 3) return <ClientHearingsView />
  return <StaffHearingsView />
}

function StaffHearingsView() {
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listHearings()
      .then((rows) => setHearings([...rows].sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load hearings.'))
      .finally(() => setLoading(false))
  }, [])

  const today = isoDate(new Date())
  const upcoming = hearings.filter((h) => h.hearing_date >= today)
  const past = hearings.filter((h) => h.hearing_date < today)

  function renderTable(rows: HearingSummary[], emptyLabel: string) {
    return (
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Case</th>
              <th className={styles.th}>Court</th>
              <th className={styles.th}>Judge</th>
              <th className={styles.th}>Date</th>
              <th className={styles.th}>Time</th>
              <th className={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const [color, bg] = STATUS_STYLE_MAP[h.hearing_status] || DEFAULT_STATUS_STYLE
              return (
                <tr key={h.id} className={styles.tr}>
                  <td className={styles.tdMono}>{h.case_number ?? '—'}</td>
                  <td className={styles.td}>{h.court_name ?? '—'}</td>
                  <td className={styles.td}>{h.judge_name ?? '—'}</td>
                  <td className={styles.td}>{h.hearing_date}</td>
                  <td className={styles.td}>{h.hearing_time ?? '—'}</td>
                  <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{h.hearing_status}</span></td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td className={styles.td} colSpan={6} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>{emptyLabel}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Hearings</div>
            <div className={styles.subtitle}>Upcoming and past hearing dates across your cases.</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading hearings…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.tableHeadTitle}>Upcoming</div>
            {renderTable(upcoming, 'No upcoming hearings.')}
            <div className={styles.tableHeadTitle}>Past</div>
            {renderTable(past, 'No past hearings.')}
          </>
        )}
      </div>
    </div>
  )
}

function ClientHearingsView() {
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewDate, setViewDate] = useState(() => new Date())

  useEffect(() => {
    listHearings()
      .then(setHearings)
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

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = new Date(year, month, 1).getDay()
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

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
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

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
              <div className={styles.statCard} style={{ border: `1.5px solid ${error ? '#EF5350' : '#B08D3E'}` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Status</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: error ? '#B05C5C' : '#2E9E58' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: error ? '#EF5350' : '#4CAF50' }} />
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
                  const dateKey = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
                  const dayHearings = dateKey ? byDate.get(dateKey) ?? [] : []
                  const isToday = dateKey === today
                  return (
                    <div key={i} className={styles.calendarCell}>
                      {day && <div className={styles.calendarDayNum} style={isToday ? { background: PRIMARY, color: '#FFFFFF' } : {}}>{day}</div>}
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
