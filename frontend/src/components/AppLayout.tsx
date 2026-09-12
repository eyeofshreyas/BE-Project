/** Shell rendered around every `AppLayout`-wrapped route: role-dependent sidebar nav + topbar (search, notifications, profile menu). */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { Icon, type IconName } from './icons'
import { C } from './theme'
import { listNotifications, listConversations } from '../api/client'
import type { UserProfile, NotificationSummary } from '../types/api'
import styles from './AppShell.module.css'

const ROLE_LABELS: Record<number, string> = { 1: 'Super Admin', 2: 'Lawyer', 3: 'Client' }
const BRAND_SUB_LABELS: Record<number, string> = { 1: 'Admin Console', 2: 'Legal Intelligence', 3: 'Client Portal' }
const UNREAD_POLL_MS = 30000

type NavDef = { label: string; icon: IconName; path?: string }

const LAWYER_NAV: NavDef[] = [
  { label: 'Dashboard', icon: 'grid', path: '/dashboard' },
  { label: 'Messages', icon: 'message-circle', path: '/messages' },
  { label: 'Conveyancing', icon: 'scale', path: '/conveyancing' },
  { label: 'Cases', icon: 'briefcase', path: '/cases' },
  { label: 'Clients', icon: 'users', path: '/clients' },
  { label: 'Documents', icon: 'file-text', path: '/documents' },
  { label: 'Judgements', icon: 'gavel', path: '/judgements' },
  { label: 'Calendar', icon: 'calendar', path: '/hearings' },
  { label: 'Billing', icon: 'receipt', path: '/billing' },
]

// An admin drilling into a case/document/etc. lands in this same shared shell (it's built
// for lawyer use, but the backend permits admin on all of it too) -- swap the Dashboard
// link for one back to the admin console, since /dashboard is the lawyer's own dashboard
// and an admin arriving here has no other way back to /admin.
const ADMIN_STAFF_NAV: NavDef[] = [
  { label: 'Admin Console', icon: 'grid', path: '/admin' },
  ...LAWYER_NAV.slice(1),
]

const CLIENT_NAV: NavDef[] = [
  { label: 'Dashboard', icon: 'grid', path: '/dashboard' },
  { label: 'Messages', icon: 'message-circle', path: '/messages' },
  { label: 'My Cases', icon: 'briefcase', path: '/cases' },
  { label: 'Conveyancing', icon: 'scale', path: '/conveyancing' },
  { label: 'Documents', icon: 'file-text', path: '/documents' },
  { label: 'Hearings', icon: 'calendar', path: '/hearings' },
  { label: 'Invoices', icon: 'receipt', path: '/billing' },
]

// Same read-and-parse as ProtectedRoute.tsx's loadProfile -- duplicated
// per-file across the app rather than shared, see that file's note.
function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

/**
 * Sidebar (role-dependent `LAWYER_NAV`/`CLIENT_NAV`) + topbar wrapper for
 * gated pages. Loads notifications via `listNotifications()`, marks them
 * read via `markNotificationRead()` on click, and handles logout by
 * clearing the session and navigating to `/login`.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile] = useState<UserProfile | null>(loadProfile)
  const [notifications, setNotifications] = useState<NotificationSummary[]>([])
  const [profileOpen, setProfileOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  // Notifications for the bell dropdown. Polled so a reminder/update sent while the
  // user is elsewhere (or just sitting on a page) shows up without a manual reload.
  useEffect(() => {
    function load() {
      listNotifications().then(setNotifications).catch(() => {})
    }
    load()
    const interval = setInterval(load, UNREAD_POLL_MS)
    return () => clearInterval(interval)
  }, [location.pathname])

  // Unread message count for the Messages nav badge. Polled so it stays live while the
  // user is on other pages -- the Messages page itself clears it on open.
  useEffect(() => {
    function load() {
      listConversations()
        .then((rows) => setUnreadMessages(rows.reduce((sum, c) => sum + c.unread_count, 0)))
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, UNREAD_POLL_MS)
    return () => clearInterval(interval)
  }, [location.pathname])

  function logout() {
    localStorage.removeItem('lexflow_token')
    localStorage.removeItem('lexflow_profile')
    navigate('/login')
  }

  function closeMenus() {
    setProfileOpen(false)
  }

  const navItems = profile?.role_id === 3 ? CLIENT_NAV : profile?.role_id === 1 ? ADMIN_STAFF_NAV : LAWYER_NAV

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarBrandRow}>
          <img src={logo} alt="LexFlow" className={styles.sidebarLogo} />
          <div>
            <div className={styles.sidebarBrandName}>LexFlow</div>
            <div className={styles.sidebarBrandSub}>{profile ? (BRAND_SUB_LABELS[profile.role_id] ?? 'Workspace') : 'Workspace'}</div>
          </div>
        </div>
        <div className={styles.navList}>
          {navItems.map((item) => {
            const active = !!item.path && location.pathname === item.path
            if (!item.path) {
              return (
                <div key={item.label} className={styles.navRowDisabled} title={`${item.label} — coming soon`}>
                  <span className={styles.navIcon}><Icon name={item.icon} size={18} color="#8C857A" /></span>
                  <span className={styles.navLabel} style={{ color: '#575145' }}>{item.label}</span>
                  <span className={styles.soonPill}>Soon</span>
                </div>
              )
            }
            return (
              <div key={item.label} className={styles.navRow} style={{ background: active ? '#E6E0CE' : 'transparent' }} onClick={() => navigate(item.path!)} title={item.label}>
                <span className={styles.navIcon}><Icon name={item.icon} size={18} color={active ? C.primaryDark : '#8C857A'} /></span>
                <span className={styles.navLabel} style={{ fontWeight: active ? 600 : 500, color: active ? C.text : '#575145' }}>{item.label}</span>
                {item.path === '/messages' && unreadMessages > 0 && (
                  <span className={styles.navBadge}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                )}
              </div>
            )
          })}
        </div>
        <div className={styles.sidebarFooter}>
          <div className={styles.navRow} style={{ background: location.pathname === '/settings' ? '#E6E0CE' : 'transparent' }} onClick={() => navigate('/settings')} title="Settings">
            <span className={styles.navIcon}><Icon name="settings" size={18} color={location.pathname === '/settings' ? C.primaryDark : '#8C857A'} /></span>
            <span className={styles.navLabel} style={{ fontWeight: location.pathname === '/settings' ? 600 : 500, color: location.pathname === '/settings' ? C.text : '#575145' }}>Settings</span>
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
            <input placeholder="Search cases, clients, documents..." className={styles.searchInput} disabled />
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.todayLabel}>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div className={styles.bellBtn} onClick={() => navigate('/notifications')}>
              <Icon name="bell" size={19} color="#575145" />
              {notifications.some((n) => !n.is_read) && <span className={styles.bellDot} />}
            </div>
            <div className={styles.vDivider} />
            <div style={{ position: 'relative' }}>
              <div className={styles.profileBtn} onClick={(e) => { e.stopPropagation(); setProfileOpen((v) => !v) }}>
                <div className={styles.avatarCircle}>{profile ? initialsOf(profile.full_name) : '—'}</div>
                <div style={{ lineHeight: 1.25 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17' }}>{profile?.full_name ?? 'Unknown user'}</div><div style={{ fontSize: 11, color: '#8C857A' }}>{profile ? (ROLE_LABELS[profile.role_id] ?? 'User') : ''}</div></div>
                <span style={{ color: '#8C857A', display: 'flex' }}><Icon name="chevron-down" size={15} color="#8C857A" /></span>
              </div>
              {profileOpen && (
                <div className={styles.profileDropdown}>
                  <div className={styles.profileDropdownItem} onClick={() => navigate('/settings')}>My Profile</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }} onClick={closeMenus}>
          {children}
        </div>
      </div>
    </div>
  )
}
