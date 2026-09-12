/** Admin console "Notifications" tab: master/detail over the admin's own notifications,
 * which `AdminConsolePage` loads (`listNotifications()`) and shares with the bell dropdown. */
import { Icon, type IconName } from '../../../components/icons'
import { C } from '../../../components/theme'
import type { NotificationSummary } from '../../../types/api'
import { formatDate, timeAgo } from '../../../utils/date'
import styles from '../../../components/AppShell.module.css'

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
 * Lists every notification addressed to this admin; clicking a row selects it (and marks
 * it read through `onOpen`) and expands its full message in the detail panel alongside.
 */
export default function NotificationsView({ notifications, selectedId, onOpen, onClose }: { notifications: NotificationSummary[]; selectedId: number | null; onOpen: (n: NotificationSummary) => void; onClose: () => void }) {
  // Selection lives in AdminConsolePage so the bell dropdown can open a row while this
  // tab is already mounted -- local state here would ignore the new prop.
  const detail = notifications.find((n) => n.id === selectedId) ?? null

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Notifications</div>
        <div className={styles.pageSubtitle}>Client requests, invoice reminders and hearing alerts addressed to this admin account.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: detail ? '340px minmax(0,1fr)' : 'minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 2px rgba(35, 48, 107,.04)' }}>
          <div style={{ padding: '13px 16px', fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', color: '#6E6759', borderBottom: `1px solid ${C.border}` }}>All notifications</div>
          {notifications.length === 0 && <div style={{ padding: '14px 16px', fontSize: 12.5, color: '#8C857A' }}>No notifications.</div>}
          {notifications.map((n, i) => {
            const s = notifStyle(n.notification_type)
            return (
              <div
                key={n.id}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', cursor: 'pointer', borderBottom: i === notifications.length - 1 ? 'none' : '1px solid #F1EDE0', background: selectedId === n.id ? '#FCF6EA' : 'transparent' }}
                onClick={() => onOpen(n)}
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
              <div style={{ width: 30, height: 30, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }} onClick={onClose}><Icon name="x" size={15} color="#6E6759" /></div>
            </div>
            <div style={{ height: 1, background: '#F1EDE0' }} />
            <div style={{ fontSize: 13.5, color: '#4A3F2E', lineHeight: 1.6 }}>{detail.message ?? 'No further detail.'}</div>
          </div>
        )}
      </div>
    </>
  )
}
