/** Shared master/detail notifications UI: every notification on the left, the selected
 * one's full message on the right with a "Mark as read"/"Back" action bar. Selection is
 * local to this component -- the caller only needs to fetch `notifications` and wire up
 * `onMarkRead`. Used by the admin console's own tab (`admin/views/NotificationsView.tsx`)
 * and the lawyer/client `/notifications` route (`pages/notifications/NotificationsPage.tsx`). */
import { useState } from 'react'
import { Icon, type IconName } from './icons'
import { C } from './theme'
import type { NotificationSummary } from '../types/api'
import { timeAgo } from '../utils/date'

function notifStyle(n: NotificationSummary): { icon: IconName; color: string } {
  const text = `${n.notification_type} ${n.title ?? ''}`.toLowerCase()
  if (/accepted|received|completed|resolved|confirmed|status/.test(text)) return { icon: 'check-circle', color: C.success }
  if (text.includes('request')) return { icon: 'user-plus', color: C.primaryDark }
  return { icon: 'info', color: C.primaryDark }
}

const BTN_GHOST = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: '#FCFAF4', color: C.text, border: `1px solid ${C.border}` }
const BTN_PRIMARY = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: C.primary, color: '#FCFAF4', boxShadow: '0 4px 12px rgba(35, 48, 107,.28)' }

export default function NotificationsPanel({ notifications, onMarkRead }: { notifications: NotificationSummary[]; onMarkRead: (n: NotificationSummary) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const detail = notifications.find((n) => n.id === selectedId) ?? null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: detail ? '340px minmax(0,1fr)' : 'minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
      <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 2px rgba(35, 48, 107,.04)' }}>
        <div style={{ padding: '13px 16px', fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', color: '#6E6759', borderBottom: `1px solid ${C.border}` }}>All notifications</div>
        {notifications.length === 0 && <div style={{ padding: '14px 16px', fontSize: 12.5, color: '#8C857A' }}>No notifications.</div>}
        {notifications.map((n, i) => {
          const s = notifStyle(n)
          const selected = selectedId === n.id
          return (
            <div
              key={n.id}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px 14px 13px', cursor: 'pointer', borderBottom: i === notifications.length - 1 ? 'none' : '1px solid #F1EDE0', borderLeft: `3px solid ${selected ? C.primary : 'transparent'}`, background: selected ? '#FCF6EA' : 'transparent' }}
              onClick={() => setSelectedId(n.id)}
            >
              <div style={{ width: 30, height: 30, borderRadius: 3, background: s.color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={s.icon} size={15} color={s.color} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#1A1A17', lineHeight: 1.45, fontWeight: n.is_read ? 500 : 600 }}>{n.title ?? n.message}</div>
                <div style={{ fontSize: 11, color: '#8C857A', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {detail && (
        <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 28, boxShadow: '0 1px 2px rgba(35, 48, 107,.04)', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 3, background: notifStyle(detail).color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={notifStyle(detail).icon} size={19} color={notifStyle(detail).color} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "'Spectral',serif", fontSize: 20, fontWeight: 700, color: '#1A1A17', lineHeight: 1.35 }}>{detail.title ?? detail.message}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11.5, color: '#8C857A' }}>{timeAgo(detail.created_at)}</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', color: '#575145', background: '#E6E0CE', padding: '4px 9px', borderRadius: 3 }}>{detail.notification_type.replace(/_/g, ' ')}</div>
                {detail.case_number && <div style={{ fontSize: 11, color: '#6E6759' }}>{detail.case_number}</div>}
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: '#F1EDE0' }} />
          <div style={{ fontSize: 13.5, color: '#4A3F2E', lineHeight: 1.6 }}>{detail.message ?? 'No further detail.'}</div>
          <div style={{ height: 1, background: '#F1EDE0' }} />
          <div style={{ display: 'flex', gap: 10 }}>
            {detail.is_read
              ? <div style={{ ...BTN_GHOST, cursor: 'default', color: C.muted }}>Read</div>
              : <div style={BTN_PRIMARY} onClick={() => onMarkRead(detail)}>Mark as read</div>}
            <div style={BTN_GHOST} onClick={() => setSelectedId(null)}>Back</div>
          </div>
        </div>
      )}
    </div>
  )
}
