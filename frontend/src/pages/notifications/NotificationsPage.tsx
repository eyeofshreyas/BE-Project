/** `/notifications` route (lawyer & client): every notification for the signed-in user,
 * reached via the bell icon in `AppLayout`'s topbar. Presentation is shared with the admin
 * console's own tab through `NotificationsPanel`. */
import { useEffect, useState } from 'react'
import { listNotifications, markNotificationRead } from '../../api/client'
import type { NotificationSummary } from '../../types/api'
import NotificationsPanel from '../../components/NotificationsPanel'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationSummary[]>([])

  useEffect(() => {
    listNotifications().then(setNotifications).catch(() => {})
  }, [])

  function markRead(n: NotificationSummary) {
    markNotificationRead(n.id)
      .then((updated) => setNotifications((prev) => prev.map((x) => (x.id === updated.id ? updated : x))))
      .catch(() => {})
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div>
          <div className={styles.title}>Notifications</div>
          <div className={styles.subtitle}>Select a notification to read the full update.</div>
        </div>
        <NotificationsPanel notifications={notifications} onMarkRead={markRead} />
      </div>
    </div>
  )
}
