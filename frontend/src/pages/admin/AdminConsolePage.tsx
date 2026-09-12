/**
 * Self-contained admin console shell for `/admin` (renders its own sidebar/topbar
 * rather than `AppLayout`). Owns the active-tab state and switches between the
 * `views/*` components; loads notifications via `listNotifications()`.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../../assets/logo.svg'
import { Icon, type IconName } from '../../components/icons'
import { C } from '../../components/theme'
import DashboardView from './views/DashboardView'
import UsersView from './views/UsersView'
import CasesView from './views/CasesView'
import DocumentsView from './views/DocumentsView'
import NotificationsView from './views/NotificationsView'
import ReportsView from './views/ReportsView'
import AnalyticsView from './views/AnalyticsView'
import SettingsView from './views/SettingsView'
import { listNotifications, markNotificationRead } from '../../api/client'
import type { UserProfile, NotificationSummary } from '../../types/api'
import { timeAgo } from '../../utils/date'
import styles from '../../components/AppShell.module.css'

type PageKey = 'dashboard' | 'users' | 'cases' | 'documents' | 'notifications' | 'reports' | 'analytics' | 'settings'

const ROLE_LABELS: Record<number, string> = { 1: 'Super Admin', 2: 'Lawyer', 3: 'Client' }

const NOTIF_COLORS: Record<string, string> = { hearing: C.warning, invoice_reminder: C.success, client_request: C.primary }

const TODAY = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const NAV_ITEMS: { key: PageKey; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'users', label: 'Users', icon: 'users' },
  { key: 'cases', label: 'Cases', icon: 'scale' },
  { key: 'documents', label: 'Documents', icon: 'file-text' },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-2' },
  { key: 'analytics', label: 'Analytics', icon: 'pie-chart' },
]

/**
 * Renders admin sidebar nav + topbar, and swaps in `DashboardView`, `UsersView`,
 * `CasesView`, `DocumentsView`, `ReportsView`, `AnalyticsView`, or `SettingsView`
 * based on `activePage`. Handles notification read/logout, and shows a toast
 * (e.g. after `SettingsView` saves).
 */
export default function AdminConsolePage() {
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(loadProfile)
  const [notifications, setNotifications] = useState<NotificationSummary[]>([])
  const [openNotifId, setOpenNotifId] = useState<number | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!profile) return
    listNotifications().then(setNotifications).catch(() => {})
  }, [profile])

  function openNotification(n: NotificationSummary) {
    if (!n.is_read) {
      markNotificationRead(n.id)
        .then((updated) => setNotifications((prev) => prev.map((x) => (x.id === updated.id ? updated : x))))
        .catch(() => {})
    }
    setOpenNotifId(n.id)
    goTo('notifications')
  }

  function saveProfile(updated: UserProfile) {
    setProfile(updated)
    localStorage.setItem('lexflow_profile', JSON.stringify(updated))
  }

  function logout() {
    localStorage.removeItem('lexflow_token')
    localStorage.removeItem('lexflow_profile')
    navigate('/')
  }

  function closeMenus() {
    setNotifOpen(false)
    setProfileOpen(false)
  }

  function goTo(key: PageKey) {
    setActivePage(key)
    closeMenus()
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3200)
  }

  const quickActions = [
    { label: 'Add New Lawyer', icon: 'user-plus' as const, primary: true, onClick: () => goTo('users') },
    { label: 'Add New Client', icon: 'user-plus' as const, onClick: () => goTo('users') },
    { label: 'Create Case', icon: 'plus' as const, onClick: () => goTo('cases') },
    { label: 'Generate Report', icon: 'file-text' as const, onClick: () => goTo('reports') },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarBrandRow}>
          <img src={logo} alt="LexFlow" className={styles.sidebarLogo} />
          <div>
            <div className={styles.sidebarBrandName}>LexFlow</div>
            <div className={styles.sidebarBrandSub}>Admin Console</div>
          </div>
        </div>
        <div className={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === activePage
            return (
              <div key={item.key} className={styles.navRow} style={{ background: active ? '#E6E0CE' : 'transparent' }} onClick={() => goTo(item.key)} title={item.label}>
                <span className={styles.navIcon}><Icon name={item.icon} size={18} color={active ? C.primaryDark : '#8C857A'} /></span>
                <span className={styles.navLabel} style={{ fontWeight: active ? 600 : 500, color: active ? C.text : '#575145' }}>{item.label}</span>
              </div>
            )
          })}
        </div>
        <div className={styles.sidebarFooter}>
          <div className={styles.navRow} style={{ background: activePage === 'settings' ? '#E6E0CE' : 'transparent' }} onClick={() => goTo('settings')} title="Settings">
            <span className={styles.navIcon}><Icon name="settings" size={18} color={activePage === 'settings' ? C.primaryDark : '#8C857A'} /></span>
            <span className={styles.navLabel} style={{ fontWeight: activePage === 'settings' ? 600 : 500, color: activePage === 'settings' ? C.text : '#575145' }}>Settings</span>
          </div>
          <div className={styles.logoutRow} onClick={logout} title="Logout">
            <span className={styles.navIcon}><Icon name="log-out" size={18} color="#8C857A" /></span>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#575145' }}>Logout</span>
          </div>
        </div>
      </div>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.searchBox}>
            <Icon name="search" size={17} color="#8C857A" />
            <input placeholder="Search users, lawyers, clients, cases, documents..." className={styles.searchInput} />
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.todayLabel}>{TODAY}</div>
            <div style={{ position: 'relative' }}>
              <div className={styles.bellBtn} style={{ background: notifOpen ? '#E6E0CE' : 'transparent' }} onClick={(e) => { e.stopPropagation(); setNotifOpen((v) => !v); setProfileOpen(false) }}>
                <Icon name="bell" size={19} color="#575145" />
                {notifications.some((n) => !n.is_read) && <span className={styles.bellDot} />}
              </div>
              {notifOpen && (
                <div className={styles.notifDropdown}>
                  <div className={styles.notifDropdownTitle}>Notifications</div>
                  {notifications.length === 0 && <div style={{ padding: '10px 4px', fontSize: 12.5, color: '#8C857A' }}>No notifications.</div>}
                  {notifications.map((n) => (
                    <div key={n.id} className={styles.notifDropdownRow} onClick={() => openNotification(n)}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: n.is_read ? '#CFC6B0' : (NOTIF_COLORS[n.notification_type.toLowerCase()] ?? C.primary) }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: '#1A1A17', lineHeight: 1.4 }}>{n.title ?? n.message}</div>
                        <div style={{ fontSize: 11, color: '#8C857A', marginTop: 2 }}>{timeAgo(n.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.vDivider} />
            <div style={{ position: 'relative' }}>
              <div className={styles.profileBtn} onClick={(e) => { e.stopPropagation(); setProfileOpen((v) => !v); setNotifOpen(false) }}>
                <div className={styles.avatarCircle}>{profile ? initialsOf(profile.full_name) : '—'}</div>
                <div style={{ lineHeight: 1.25 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17' }}>{profile?.full_name ?? 'Unknown user'}</div><div style={{ fontSize: 11, color: '#8C857A' }}>{profile ? (ROLE_LABELS[profile.role_id] ?? 'User') : ''}</div></div>
                <span style={{ color: '#8C857A', display: 'flex' }}><Icon name="chevron-down" size={15} color="#8C857A" /></span>
              </div>
              {profileOpen && (
                <div className={styles.profileDropdown}>
                  <div className={styles.profileDropdownItem}>Admin Profile</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.content} onClick={closeMenus}>
          {activePage === 'dashboard' && <DashboardView quickActions={quickActions} adminName={profile?.full_name ?? null} />}
          {activePage === 'users' && <UsersView />}
          {activePage === 'cases' && <CasesView />}
          {activePage === 'documents' && <DocumentsView />}
          {activePage === 'notifications' && <NotificationsView notifications={notifications} selectedId={openNotifId} onOpen={openNotification} onClose={() => setOpenNotifId(null)} />}
          {activePage === 'reports' && <ReportsView onGenerate={showToast} />}
          {activePage === 'analytics' && <AnalyticsView />}
          {activePage === 'settings' && <SettingsView profile={profile} onSave={showToast} onProfileChange={saveProfile} />}
        </div>
      </div>

      {toast && (
        <div className={styles.toast}>
          <span>{toast}</span>
          <span className={styles.toastDismiss} onClick={() => setToast(null)}>Dismiss</span>
        </div>
      )}
    </div>
  )
}
