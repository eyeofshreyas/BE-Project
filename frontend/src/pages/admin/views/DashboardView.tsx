/** Admin console "Dashboard" tab: platform overview stats (`getAdminStats()`), the
 * platform-wide activity feed (`listAdminActivity()`), and a master/detail list of the
 * admin's own notifications (passed down from `AdminConsolePage`). */
import { useEffect, useState } from 'react'
import { Icon, type IconName } from '../../../components/icons'
import { C } from '../../../components/theme'
import { getAdminStats, listAdminActivity } from '../../../api/client'
import type { AdminStats, ActivityEvent, NotificationSummary } from '../../../types/api'
import { formatDate, timeAgo } from '../../../utils/date'
import styles from '../../../components/AppShell.module.css'

type QuickAction = { label: string; icon: 'user-plus' | 'plus' | 'file-text'; primary?: boolean; onClick: () => void }

const NUMBER_FMT = new Intl.NumberFormat('en-IN')
const RUPEE_FMT = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** The eight overview cards, in display order: label, icon, and how to read the value off `AdminStats`. */
const OVERVIEW_CARDS: { label: string; icon: IconName; value: (s: AdminStats) => string }[] = [
  { label: 'Total Users', icon: 'users', value: (s) => NUMBER_FMT.format(s.total_users) },
  { label: 'Active Lawyers', icon: 'briefcase', value: (s) => NUMBER_FMT.format(s.active_lawyers) },
  { label: 'Registered Clients', icon: 'user', value: (s) => NUMBER_FMT.format(s.registered_clients) },
  { label: 'Active Cases', icon: 'scale', value: (s) => NUMBER_FMT.format(s.active_cases) },
  { label: 'Documents Uploaded', icon: 'file-text', value: (s) => NUMBER_FMT.format(s.documents_uploaded) },
  { label: 'AI Summaries Generated', icon: 'sparkles', value: (s) => NUMBER_FMT.format(s.ai_summaries) },
  { label: 'Revenue This Month', icon: 'banknote', value: (s) => RUPEE_FMT.format(s.revenue_this_month) },
  { label: 'Pending Hearings', icon: 'calendar', value: (s) => NUMBER_FMT.format(s.pending_hearings) },
]

/** Timeline `event_type` -> icon. Unknown types (added later, backend-side) fall back to the clock. */
const EVENT_ICONS: Record<string, IconName> = {
  hearing_scheduled: 'calendar',
  hearing_updated: 'calendar',
  status_change: 'scale',
  document_uploaded: 'file-text',
  note_added: 'edit',
}

/** Notification `notification_type` -> icon + accent colour, with a neutral fallback. */
const NOTIF_STYLES: Record<string, { icon: IconName; color: string }> = {
  client_request: { icon: 'user-plus', color: C.primaryDark },
  invoice_reminder: { icon: 'receipt', color: C.warning },
  hearing: { icon: 'calendar', color: C.warning },
  payment: { icon: 'banknote', color: C.success },
  document: { icon: 'file-text', color: C.primary },
}

function notifStyle(type: string) {
  return NOTIF_STYLES[type.toLowerCase()] ?? { icon: 'bell' as IconName, color: C.primaryDark }
}

/**
 * Renders `quickActions` (passed from `AdminConsolePage`), the overview stat grid,
 * the recent-activity feed, and a master/detail panel over `notifications` (click a
 * row to expand it on the right). Stats and activity load on mount.
 */
export default function DashboardView({ quickActions, notifications, adminName }: { quickActions: QuickAction[]; notifications: NotificationSummary[]; adminName: string | null }) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedNotif, setSelectedNotif] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([getAdminStats(), listAdminActivity()])
      .then(([s, a]) => { setStats(s); setActivity(a) })
      .catch((e: Error) => setError(e.message))
  }, [])

  const detail = notifications.find((n) => n.id === selectedNotif) ?? null

  return (
    <>
      <div className={styles.pageHeadRow}>
        <div>
          <div className={styles.pageTitle}>Welcome back{adminName ? `, ${adminName.split(' ')[0]}` : ''}</div>
          <div className={styles.pageSubtitle}>Monitor users, legal cases, documents, AI activity, and overall platform performance from one centralized dashboard.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {quickActions.map((qa) => (
            <div
              key={qa.label}
              className={styles.chipBase}
              style={{ color: qa.primary ? '#FCFAF4' : '#33302A', background: qa.primary ? C.primary : '#FCFAF4', border: qa.primary ? 'none' : `1px solid ${C.border}` }}
              onClick={qa.onClick}
            >
              <Icon name={qa.icon} size={15} color={qa.primary ? '#FCFAF4' : C.primaryDark} /><span>{qa.label}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <div style={{ background: '#FCFAF4', border: `1px solid ${C.danger}`, borderRadius: 3, padding: '12px 16px', fontSize: 13, color: C.danger }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
        {OVERVIEW_CARDS.map((c) => (
          <div key={c.label} style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(158deg,#FCFAF4 0%,#F1EDE0 100%)', border: `1px solid ${C.border}`, borderRadius: 3, padding: '15px 16px 13px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 2px rgba(35, 48, 107,.05)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#23306B,#1A2551)' }} />
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#F6EDDC 0%,#E6E0CE 100%)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={c.icon} size={18} color={C.primaryDark} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 9.5, color: '#6E6759', fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
              <div style={{ fontFamily: "'Spectral',serif", fontSize: 25, fontWeight: 700, color: '#1A1A17', lineHeight: 1, letterSpacing: '-.02em', marginTop: 5 }}>{stats ? c.value(stats) : '—'}</div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>Recent Activity</div>
        <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: '10px 22px', boxShadow: '0 1px 2px rgba(35, 48, 107,.04)', display: 'flex', flexDirection: 'column' }}>
          {activity.length === 0 && <div style={{ padding: '14px 0', fontSize: 12.5, color: '#8C857A' }}>{stats ? 'No activity recorded yet.' : 'Loading activity…'}</div>}
          {activity.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: i === activity.length - 1 ? 'none' : '1px solid #F1EDE0' }}>
              <div style={{ width: 28, height: 28, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={EVENT_ICONS[a.event_type] ?? 'clock'} size={14} color={C.primaryDark} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A17' }}>{a.event_title}</div>
                <div style={{ fontSize: 12, color: '#6E6759', marginTop: 2, lineHeight: 1.4 }}>
                  {a.event_description ?? '—'}{a.case_number ? ` · ${a.case_number}` : ''}{a.actor ? ` · by ${a.actor}` : ''}
                </div>
                <div style={{ fontSize: 11, color: '#8C857A', marginTop: 4 }}>{timeAgo(a.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle}>System Notifications</div>
        <div style={{ fontSize: 13, color: '#6E6759', margin: '4px 0 14px' }}>Client requests, invoice reminders and hearing alerts addressed to this admin account.</div>
        <div style={{ display: 'grid', gridTemplateColumns: detail ? '340px minmax(0,1fr)' : 'minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 2px rgba(35, 48, 107,.04)' }}>
            <div style={{ padding: '13px 16px', fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', color: '#6E6759', borderBottom: `1px solid ${C.border}` }}>All notifications</div>
            {notifications.length === 0 && <div style={{ padding: '14px 16px', fontSize: 12.5, color: '#8C857A' }}>No notifications.</div>}
            {notifications.map((n, i) => {
              const s = notifStyle(n.notification_type)
              return (
                <div
                  key={n.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', cursor: 'pointer', borderBottom: i === notifications.length - 1 ? 'none' : '1px solid #F1EDE0', background: selectedNotif === n.id ? '#FCF6EA' : 'transparent' }}
                  onClick={() => setSelectedNotif(n.id)}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 3, background: s.color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={s.icon} size={15} color={s.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#1A1A17', lineHeight: 1.45, fontWeight: n.is_read ? 500 : 600 }}>{n.title ?? n.message}</div>
                    <div style={{ fontSize: 11, color: '#8C857A', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: s.color }} />}
                </div>
              )
            })}
          </div>
          {detail && (
            <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 28, boxShadow: '0 1px 2px rgba(35, 48, 107,.04)', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 3, background: notifStyle(detail.notification_type).color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={notifStyle(detail.notification_type).icon} size={20} color={notifStyle(detail.notification_type).color} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: "'Spectral',serif", fontSize: 21, fontWeight: 700, color: '#1A1A17', lineHeight: 1.35 }}>{detail.title ?? detail.message}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 11.5, color: '#8C857A' }}>{formatDate(detail.created_at)}</div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', color: '#575145', background: '#E6E0CE', padding: '4px 9px', borderRadius: 3 }}>{detail.notification_type.replace(/_/g, ' ')}</div>
                    {detail.case_number && <div style={{ fontSize: 11, color: '#6E6759' }}>{detail.case_number}</div>}
                  </div>
                </div>
                <div style={{ width: 30, height: 30, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }} onClick={() => setSelectedNotif(null)}><Icon name="x" size={15} color="#6E6759" /></div>
              </div>
              <div style={{ height: 1, background: '#F1EDE0' }} />
              <div style={{ fontSize: 13.5, color: '#4A3F2E', lineHeight: 1.6 }}>{detail.message ?? 'No further detail.'}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
        <div style={{ fontSize: 12.5, color: '#6E6759' }}>AI-Assisted Legal Workflow and Document Intelligence Platform</div>
        <div style={{ fontSize: 11.5, color: '#8C857A', marginTop: 4 }}>© 2026 LexFlow Technologies</div>
      </div>
    </>
  )
}
