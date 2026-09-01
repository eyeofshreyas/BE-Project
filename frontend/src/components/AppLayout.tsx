/** Shell rendered around every `AppLayout`-wrapped route: role-dependent sidebar nav + topbar (search, notifications, profile menu). */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { Icon, type IconName } from './icons'
import { C } from './theme'
import { listNotifications, markNotificationRead } from '../api/client'
import type { UserProfile, NotificationSummary } from '../types/api'
import { timeAgo } from '../utils/date'
import styles from './AppShell.module.css'

const ROLE_LABELS: Record<number, string> = { 2: 'Lawyer', 3: 'Client' }
const BRAND_SUB_LABELS: Record<number, string> = { 2: 'Legal Intelligence', 3: 'Client Portal' }
const NOTIF_COLORS: Record<string, string> = { Hearing: C.warning, Payment: C.success, Document: C.primary }

type NavDef = { label: string; icon: IconName; path?: string }

const LAWYER_NAV: NavDef[] = [
  { label: 'Dashboard', icon: 'grid', path: '/dashboard' },
  { label: 'Conveyancing', icon: 'scale', path: '/conveyancing' },
  { label: 'Cases', icon: 'briefcase', path: '/cases' },
  { label: 'Clients', icon: 'users', path: '/clients' },
  { label: 'Documents', icon: 'file-text', path: '/documents' },
  { label: 'Judgements', icon: 'gavel', path: '/judgements' },
  { label: 'Calendar', icon: 'calendar', path: '/hearings' },
  { label: 'Billing', icon: 'receipt', path: '/billing' },
]

const CLIENT_NAV: NavDef[] = [
  { label: 'Dashboard', icon: 'grid', path: '/dashboard' },
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
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    listNotifications().then(setNotifications).catch(() => {})
  }, [])

  function openNotification(n: NotificationSummary) {
    if (!n.is_read) {
      markNotificationRead(n.id)
        .then((updated) => setNotifications((prev) => prev.map((x) => (x.id === updated.id ? updated : x))))
        .catch(() => {})
    }
    setNotifOpen(false)
  }

  function logout() {
    localStorage.removeItem('lexflow_token')
    localStorage.removeItem('lexflow_profile')
    navigate('/login')
  }

  function closeMenus() {
    setNotifOpen(false)
    setProfileOpen(false)
  }

  const navItems = profile?.role_id === 3 ? CLIENT_NAV : LAWYER_NAV

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
                  <span className={styles.navIcon}><Icon name={item.icon} size={18} color="#93826d" /></span>
                  <span className={styles.navLabel} style={{ color: '#6A5C42' }}>{item.label}</span>
                  <span className={styles.soonPill}>Soon</span>
                </div>
              )
            }
            return (
              <div key={item.label} className={styles.navRow} style={{ background: active ? '#E9DCC8' : 'transparent' }} onClick={() => navigate(item.path!)} title={item.label}>
                <span className={styles.navIcon}><Icon name={item.icon} size={18} color={active ? C.primaryDark : '#93826d'} /></span>
                <span className={styles.navLabel} style={{ fontWeight: active ? 600 : 500, color: active ? C.text : '#6A5C42' }}>{item.label}</span>
              </div>
            )
          })}
        </div>
        <div className={styles.sidebarFooter}>
          <div className={styles.navRow} style={{ background: location.pathname === '/settings' ? '#E9DCC8' : 'transparent' }} onClick={() => navigate('/settings')} title="Settings">
            <span className={styles.navIcon}><Icon name="settings" size={18} color={location.pathname === '/settings' ? C.primaryDark : '#93826d'} /></span>
            <span className={styles.navLabel} style={{ fontWeight: location.pathname === '/settings' ? 600 : 500, color: location.pathname === '/settings' ? C.text : '#6A5C42' }}>Settings</span>
          </div>
          <div className={styles.logoutRow} onClick={logout} title="Logout">
            <span className={styles.navIcon}><Icon name="log-out" size={18} color="#93826d" /></span>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#6A5C42' }}>Logout</span>
          </div>
        </div>
      </div>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.searchBox}>
            <Icon name="search" size={17} color="#A38F66" />
            <input placeholder="Search cases, clients, documents..." className={styles.searchInput} disabled />
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.todayLabel}>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div style={{ position: 'relative' }}>
              <div className={styles.bellBtn} style={{ background: notifOpen ? '#EFE4CB' : 'transparent' }} onClick={(e) => { e.stopPropagation(); setNotifOpen((v) => !v); setProfileOpen(false) }}>
                <Icon name="bell" size={19} color="#6A5C42" />
                {notifications.some((n) => !n.is_read) && <span className={styles.bellDot} />}
              </div>
              {notifOpen && (
                <div className={styles.notifDropdown}>
                  <div className={styles.notifDropdownTitle}>Notifications</div>
                  {notifications.length === 0 && <div style={{ padding: '10px 4px', fontSize: 12.5, color: '#A38F66' }}>No notifications.</div>}
                  {notifications.map((n) => (
                    <div key={n.id} className={styles.notifDropdownRow} onClick={() => openNotification(n)}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: n.is_read ? '#D8C79A' : (NOTIF_COLORS[n.notification_type] ?? C.primary) }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: '#2A2118', lineHeight: 1.4 }}>{n.title ?? n.message}</div>
                        <div style={{ fontSize: 11, color: '#A38F66', marginTop: 2 }}>{timeAgo(n.created_at)}</div>
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
                <div style={{ lineHeight: 1.25 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118' }}>{profile?.full_name ?? 'Unknown user'}</div><div style={{ fontSize: 11, color: '#A38F66' }}>{profile ? (ROLE_LABELS[profile.role_id] ?? 'User') : ''}</div></div>
                <span style={{ color: '#A38F66', display: 'flex' }}><Icon name="chevron-down" size={15} color="#A38F66" /></span>
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
