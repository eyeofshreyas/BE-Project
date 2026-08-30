import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCases, getConveyancingSummary, listNotifications, markNotificationRead, listClientRequests, respondClientRequest } from '../../api/client'
import type { CaseSummary, ConveyancingSummary, NotificationSummary, ClientRequestSummary } from '../../types/api'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const PRIMARY_DARK = '#8f6743'
const MUTED = '#8C7C5E'

const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: PRIMARY_DARK, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const BriefcaseIcon = () => <svg {...iconProps}><rect x={2} y={7} width={20} height={14} rx={2} /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
const ClockIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={10} /><polyline points="12 6 12 12 16 14" /></svg>
const CalendarIcon = () => <svg {...iconProps}><rect x={3} y={4} width={18} height={18} rx={2} /><line x1={16} y1={2} x2={16} y2={6} /><line x1={8} y1={2} x2={8} y2={6} /><line x1={3} y1={10} x2={21} y2={10} /></svg>
const BellIcon = () => <svg {...iconProps}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>

const DEFAULT_STATUS_STYLE: [string, string] = ['#6A5C42', '#EFEAE1']
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Completed: ['#2E9E58', '#E4F5EA'],
  Closed: ['#2E9E58', '#E4F5EA'],
  Open: ['#B87F1E', '#FFF2E0'],
  'In Progress': ['#B87F1E', '#FFF2E0'],
  Pending: ['#B87F1E', '#FFF2E0'],
}

export default function ClientDashboardPage() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [summary, setSummary] = useState<ConveyancingSummary | null>(null)
  const [notifications, setNotifications] = useState<NotificationSummary[]>([])
  const [clientRequests, setClientRequests] = useState<ClientRequestSummary[]>([])
  const [respondingId, setRespondingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listCases(), getConveyancingSummary(), listNotifications(), listClientRequests()])
      .then(([c, s, n, r]) => { setCases(c); setSummary(s); setNotifications(n); setClientRequests(r) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your dashboard.'))
      .finally(() => setLoading(false))
  }, [])

  function openNotification(n: NotificationSummary) {
    if (!n.is_read) {
      markNotificationRead(n.id).catch(() => {})
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
    }
  }

  async function respondToRequest(id: number, decision: 'accept' | 'decline') {
    setRespondingId(id)
    try {
      const updated = await respondClientRequest(id, decision)
      setClientRequests((prev) => prev.map((r) => (r.id === id ? updated : r)))
      if (decision === 'accept') listCases().then(setCases).catch(() => {})
    } catch {
      // ponytail: silent failure surfaces as the row staying "pending"; add a toast if this needs to be louder.
    } finally {
      setRespondingId(null)
    }
  }

  const pendingRequests = clientRequests.filter((r) => r.status === 'pending')

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const statCards = [
    { label: 'My Cases', value: String(cases.length), icon: <BriefcaseIcon /> },
    { label: 'Active Matters', value: String(summary?.stats.active_matters ?? 0), icon: <ClockIcon /> },
    { label: 'Upcoming Appts', value: String(summary?.stats.upcoming_appointments ?? 0), icon: <CalendarIcon /> },
    { label: 'Unread Notifications', value: String(unreadCount), icon: <BellIcon /> },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>My Dashboard</div>
            <div className={styles.subtitle}>Your cases, conveyancing matters, and notifications.</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading your dashboard…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
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

            <div className={styles.midGrid}>
              <div className={styles.tableCard}>
                <div className={styles.tableHead}>
                  <div className={styles.tableHeadTitle}>My Cases</div>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Case No.</th>
                      <th className={styles.th}>Court</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}>Next Hearing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((c) => {
                      const [color, bg] = STATUS_STYLE_MAP[c.status] || DEFAULT_STATUS_STYLE
                      return (
                        <tr key={c.id} className={styles.tr} onClick={() => navigate(`/cases/${c.case_id}`)}>
                          <td className={styles.tdMono}>{c.id}</td>
                          <td className={styles.td}>{c.court ?? '—'}</td>
                          <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{c.status}</span></td>
                          <td className={styles.td}>{c.hearing ?? '—'}</td>
                        </tr>
                      )
                    })}
                    {cases.length === 0 && (
                      <tr><td className={styles.td} colSpan={4} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No cases yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className={styles.sideCol}>
                <div className={styles.panelCard}>
                  <div className={styles.panelTitle}>Notifications</div>
                  <div className={styles.quickActionsList}>
                    {pendingRequests.map((r) => (
                      <div key={`req-${r.id}`} style={{ padding: '12px 14px', border: '1px solid #E7DCC6', borderRadius: 11, background: '#FBF7EE' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118' }}>{r.lawyer_name ?? 'A lawyer'} wants to represent you</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{r.case_type_name} · {r.court_name}</div>
                        {r.message && <div style={{ fontSize: 12, color: MUTED, marginTop: 3, fontStyle: 'italic' }}>"{r.message}"</div>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <div
                            onClick={() => respondingId !== r.id && respondToRequest(r.id, 'accept')}
                            style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, padding: '7px 0', borderRadius: 8, background: PRIMARY_DARK, color: '#FFFFFF', cursor: 'pointer', opacity: respondingId === r.id ? 0.6 : 1 }}
                          >
                            Accept
                          </div>
                          <div
                            onClick={() => respondingId !== r.id && respondToRequest(r.id, 'decline')}
                            style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, padding: '7px 0', borderRadius: 8, border: '1px solid #E7DCC6', color: '#6A5C42', cursor: 'pointer', opacity: respondingId === r.id ? 0.6 : 1 }}
                          >
                            Decline
                          </div>
                        </div>
                      </div>
                    ))}
                    {notifications.map((n) => (
                      <div key={n.id} className={styles.quickAction} onClick={() => openNotification(n)} style={{ opacity: n.is_read ? 0.6 : 1 }}>
                        <span>{n.title ?? n.message ?? 'Notification'}</span>
                      </div>
                    ))}
                    {notifications.length === 0 && pendingRequests.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No notifications yet.</div>}
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
