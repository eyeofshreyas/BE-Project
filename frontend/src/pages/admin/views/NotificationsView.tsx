/** Admin console "Notifications" tab: every notification addressed to this admin, opened
 * via the bell icon in `AdminConsolePage`. Presentation is shared with the lawyer/client
 * `/notifications` route through `NotificationsPanel`. */
import NotificationsPanel from '../../../components/NotificationsPanel'
import type { NotificationSummary } from '../../../types/api'
import styles from '../../../components/AppShell.module.css'

export default function NotificationsView({ notifications, onMarkRead }: { notifications: NotificationSummary[]; onMarkRead: (n: NotificationSummary) => void }) {
  return (
    <>
      <div>
        <div className={styles.pageTitle}>Notifications</div>
        <div className={styles.pageSubtitle}>Select a notification to read the full update.</div>
      </div>
      <NotificationsPanel notifications={notifications} onMarkRead={onMarkRead} />
    </>
  )
}
