/** Client-role dashboard rendered by `DashboardPage` for `role_id === 3`. Aggregates cases, hearings, invoices, documents, notifications, and pending lawyer requests into stat cards and panels. */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listCases, listHearings, listInvoices, listDocuments, listNotifications,
  listClientRequests, respondClientRequest, getDocumentDownloadUrl, getOrCreateConversation,
} from '../../api/client'
import type {
  CaseSummary, HearingSummary, InvoiceSummary, DocumentSummary,
  NotificationSummary, ClientRequestSummary, UserProfile,
} from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate } from '../../utils/date'
import shellStyles from '../../components/AppShell.module.css'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const PRIMARY_DARK = '#8f6743'
const MUTED = '#8C7C5E'
const CLOSED_STATUSES = new Set(['Closed', 'Completed'])

const DEFAULT_STATUS_STYLE: [string, string] = ['#6A5C42', '#EFEAE1']
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Completed: ['#2E9E58', '#E4F5EA'],
  Closed: ['#2E9E58', '#E4F5EA'],
  Open: ['#B87F1E', '#FFF2E0'],
  'In Progress': ['#B87F1E', '#FFF2E0'],
  Pending: ['#B87F1E', '#FFF2E0'],
}

// ponytail: cases aren't stage-tracked (that only exists for conveyancing
// matters), so this maps status -> a representative progress figure rather
// than a real measured percentage. Swap for real stage tracking if litigation
// cases ever get one.
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

function money(n: number) {
  return `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function dueLabel(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  if (days > 1) return `Due in ${days} days`
  if (days === 1) return 'Due tomorrow'
  if (days === 0) return 'Due today'
  return `${-days}d overdue`
}

/**
 * Fetches cases/hearings/invoices/documents/notifications/client-requests in
 * parallel and derives all stat-card figures from them. Calls: `respondToRequest`
 * (accept/decline via `respondClientRequest()`), `openDocument` (via `getDocumentDownloadUrl()`).
 */
export default function ClientDashboardPage() {
  const navigate = useNavigate()
  const [profile] = useState<UserProfile | null>(loadProfile)
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [notifications, setNotifications] = useState<NotificationSummary[]>([])
  const [clientRequests, setClientRequests] = useState<ClientRequestSummary[]>([])
  const [respondingId, setRespondingId] = useState<number | null>(null)
  const [messaging, setMessaging] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listCases(), listHearings(), listInvoices(), listDocuments(), listNotifications(), listClientRequests()])
      .then(([c, h, i, d, n, r]) => { setCases(c); setHearings(h); setInvoices(i); setDocuments(d); setNotifications(n); setClientRequests(r) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your dashboard.'))
      .finally(() => setLoading(false))
  }, [])

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

  async function openDocument(id: number) {
    const tab = window.open('', '_blank')
    try {
      const { url } = await getDocumentDownloadUrl(id)
      if (tab) tab.location.href = url
    } catch {
      tab?.close()
    }
  }

  async function openConversation(lawyerId: number) {
    setMessaging(true)
    try {
      const conversation = await getOrCreateConversation(lawyerId)
      navigate(`/messages/${conversation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open your conversation.')
    } finally {
      setMessaging(false)
    }
  }

  const pendingRequests = clientRequests.filter((r) => r.status === 'pending')
  const activeCases = cases.filter((c) => !CLOSED_STATUSES.has(c.status))
  const completedCases = cases.filter((c) => CLOSED_STATUSES.has(c.status))
  const todayIso = new Date().toISOString().slice(0, 10)
  const scheduledHearings = hearings.filter((h) => h.hearing_status === 'Scheduled' && h.hearing_date >= todayIso)
  const nextHearing = [...scheduledHearings].sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))[0]
  const pendingInvoices = invoices.filter((i) => i.payment_status !== 'Paid')
  const pendingAmount = pendingInvoices.reduce((sum, i) => sum + i.total_amount, 0)
  const nearestDue = pendingInvoices.map((i) => i.due_date).filter((d): d is string => !!d).sort()[0]
  const weekAgoMs = Date.now() - 7 * 86400000
  const recentDocsCount = documents.filter((d) => new Date(d.upload_date).getTime() >= weekAgoMs).length
  const unreadCount = notifications.filter((n) => !n.is_read).length
  const primaryCase = cases.find((c) => c.lawyer_email) ?? cases.find((c) => c.lawyer)
  const recentDocuments = [...documents].sort((a, b) => b.upload_date.localeCompare(a.upload_date)).slice(0, 3)
  const firstName = profile?.full_name.split(' ')[0] ?? 'there'

  const statCards = [
    { label: 'Active Cases', value: String(activeCases.length), sublabel: 'Currently open', icon: 'briefcase' as const },
    { label: 'Upcoming Hearings', value: String(scheduledHearings.length), sublabel: nextHearing ? `Next ${formatDate(nextHearing.hearing_date)}` : 'None scheduled', icon: 'calendar' as const },
    { label: 'Pending Payments', value: money(pendingAmount), sublabel: nearestDue ? dueLabel(nearestDue) : 'All settled', icon: 'receipt' as const },
    { label: 'Uploaded Documents', value: String(documents.length), sublabel: recentDocsCount > 0 ? `+${recentDocsCount} this week` : 'All time', icon: 'file-text' as const },
    { label: 'Unread Notifications', value: String(unreadCount), sublabel: unreadCount > 0 ? 'Needs attention' : 'All caught up', icon: 'bell' as const },
    { label: 'Completed Cases', value: String(completedCases.length), sublabel: 'All time', icon: 'check-circle' as const },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Welcome back, {firstName} 👋</div>
            <div className={styles.subtitle}>Stay updated with your legal cases, hearings, documents, and AI-generated summaries.</div>
          </div>
          <div className={styles.headerActions}>
            {primaryCase?.lawyer_email ? (
              <a href={`mailto:${primaryCase.lawyer_email}`} className={styles.primaryChip} style={{ textDecoration: 'none' }}>
                <Icon name="phone" size={15} color="#FFFFFF" /> Contact Lawyer
              </a>
            ) : (
              <div className={styles.primaryChip} style={{ opacity: .5, cursor: 'default' }} title="No lawyer assigned yet">
                <Icon name="phone" size={15} color="#FFFFFF" /> Contact Lawyer
              </div>
            )}
            <div className={styles.ghostChip} onClick={() => navigate('/hearings')}>
              <Icon name="calendar" size={15} color="#2A2118" /> View Upcoming Hearing
            </div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading your dashboard…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.statCards}>
              {statCards.map((s) => (
                <div key={s.label} className={styles.statCard}>
                  <div className={styles.statIconRow}><div className={styles.statIconWrap}><Icon name={s.icon} size={19} color={PRIMARY_DARK} /></div></div>
                  <div>
                    <div className={styles.statValue}>{s.value}</div>
                    <div className={styles.statLabel}>{s.label}</div>
                    <div style={{ fontSize: 11.5, color: '#B08D3E', fontWeight: 600, marginTop: 4 }}>{s.sublabel}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.midGrid}>
              <div className={styles.tableCard}>
                <div className={styles.tableHead}>
                  <div className={styles.tableHeadTitle}>Case Progress</div>
                  <div className={styles.viewAll} onClick={() => navigate('/cases')}>View all</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {cases.map((c) => {
                    const [color, bg] = STATUS_STYLE_MAP[c.status] || DEFAULT_STATUS_STYLE
                    const pct = STATUS_PROGRESS[c.status] ?? 50
                    return (
                      <div key={c.id} style={{ padding: '16px 24px', borderTop: '1px solid #F1E9D9', cursor: 'pointer' }} onClick={() => navigate(`/cases/${c.case_id}`)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#2A2118' }}>{c.case_title ?? c.id}</div>
                            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Assigned to {c.lawyer ?? '—'} · {c.court ?? 'Court TBD'}</div>
                          </div>
                          <span className={styles.statusBadge} style={{ color, background: bg, flexShrink: 0 }}>{c.status}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                          <div className={styles.progressTrack} style={{ flex: 1 }}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#2A2118', width: 34, textAlign: 'right' }}>{pct}%</div>
                        </div>
                        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>Next hearing: {c.hearing ? formatDate(c.hearing) : '—'}</div>
                      </div>
                    )
                  })}
                  {cases.length === 0 && (
                    <div style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: '28px 0' }}>No cases yet.</div>
                  )}
                </div>
              </div>

              <div className={styles.sideCol}>
                <div className={styles.panelCard}>
                  <div className={styles.panelTitle}>Recent Documents</div>
                  <div className={styles.quickActionsList}>
                    {recentDocuments.map((d) => (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid #F1E9D9' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
                          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{d.document_type ?? 'Document'} · {formatDate(d.upload_date)}</div>
                        </div>
                        <div onClick={() => openDocument(d.id)} style={{ display: 'flex', gap: 4, cursor: 'pointer', flexShrink: 0 }} title="Open">
                          <Icon name="download" size={16} color="#6A5C42" />
                        </div>
                      </div>
                    ))}
                    {recentDocuments.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No documents yet.</div>}
                  </div>
                </div>

                <div className={styles.panelCard}>
                  <div className={styles.panelTitle}>Quick Contact</div>
                  {primaryCase?.lawyer ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#B08D3E', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                          {primaryCase.lawyer.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>{primaryCase.lawyer}</div>
                          <div style={{ fontSize: 11.5, color: MUTED }}>Your Lawyer</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, fontSize: 12.5, color: '#6A5C42' }}>
                        {primaryCase.lawyer_email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="mail" size={14} color="#93826d" />{primaryCase.lawyer_email}</div>}
                        {primaryCase.lawyer_phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="phone" size={14} color="#93826d" />{primaryCase.lawyer_phone}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        {primaryCase.lawyer_id ? (
                          <div
                            className={styles.darkBtn}
                            style={{ flex: 1, justifyContent: 'center', opacity: messaging ? 0.6 : 1, cursor: messaging ? 'default' : 'pointer' }}
                            onClick={() => !messaging && openConversation(primaryCase.lawyer_id!)}
                          >
                            Message
                          </div>
                        ) : (
                          <div className={styles.darkBtn} style={{ flex: 1, justifyContent: 'center', opacity: .5 }}>Message</div>
                        )}
                        {primaryCase.lawyer_phone ? (
                          <a href={`tel:${primaryCase.lawyer_phone}`} className={styles.darkBtn} style={{ flex: 1, justifyContent: 'center', background: '#FFFFFF', color: '#2A2118', border: '1px solid #E7DCC6', textDecoration: 'none' }}>Call</a>
                        ) : (
                          <div className={styles.darkBtn} style={{ flex: 1, justifyContent: 'center', background: '#FFFFFF', color: '#2A2118', border: '1px solid #E7DCC6', opacity: .5 }}>Call</div>
                        )}
                        <div className={styles.darkBtn} style={{ flex: 1, justifyContent: 'center', background: '#FFFFFF', color: '#2A2118', border: '1px solid #E7DCC6', opacity: .5 }} title="Scheduling coming soon">
                          Schedule<span className={shellStyles.soonPill}>Soon</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: MUTED, fontSize: 13 }}>No lawyer assigned yet.</div>
                  )}
                </div>

                {pendingRequests.length > 0 && (
                  <div className={styles.panelCard}>
                    <div className={styles.panelTitle}>Client Requests</div>
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
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
