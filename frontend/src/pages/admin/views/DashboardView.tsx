/** Admin console "Dashboard" tab: platform overview stats (`getAdminStats()`) and the
 * platform-wide activity feed (`listAdminActivity()`). Notifications live in their own
 * tab -- see `NotificationsView`. */
import { useEffect, useState } from 'react'
import { Icon, type IconName } from '../../../components/icons'
import { C } from '../../../components/theme'
import { getAdminStats, listAdminActivity } from '../../../api/client'
import type { AdminStats, ActivityEvent } from '../../../types/api'
import { timeAgo } from '../../../utils/date'
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

/**
 * Renders `quickActions` (passed from `AdminConsolePage`), the overview stat grid and
 * the recent-activity feed. Stats and activity load on mount.
 */
export default function DashboardView({ quickActions, adminName }: { quickActions: QuickAction[]; adminName: string | null }) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getAdminStats(), listAdminActivity()])
      .then(([s, a]) => { setStats(s); setActivity(a) })
      .catch((e: Error) => setError(e.message))
  }, [])

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

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
        <div style={{ fontSize: 12.5, color: '#6E6759' }}>AI-Assisted Legal Workflow and Document Intelligence Platform</div>
        <div style={{ fontSize: 11.5, color: '#8C857A', marginTop: 4 }}>© 2026 LexFlow Technologies</div>
      </div>
    </>
  )
}
