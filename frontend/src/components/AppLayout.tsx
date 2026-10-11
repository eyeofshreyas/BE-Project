/** Shell rendered around every `AppLayout`-wrapped route: role-dependent sidebar nav + topbar (search, notifications, profile menu). */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { Icon, type IconName } from './icons'
import { C } from './theme'
import { listNotifications, listConversations, listCases, listClients, listDocuments } from '../api/client'
import type { UserProfile, NotificationSummary, CaseSummary, ClientSummary, DocumentSummary } from '../types/api'
import styles from './AppShell.module.css'

const SEARCH_RESULT_LIMIT = 5

const ROLE_LABELS: Record<number, string> = { 1: 'Law Firm Manager', 2: 'Lawyer', 3: 'Client', 4: 'Super Admin' }
const BRAND_SUB_LABELS: Record<number, string> = { 1: 'Admin Console', 2: 'Legal Intelligence', 3: 'Client Portal', 4: 'Admin Console' }
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
// for lawyer use, but the backend permits admin on all of it too). Mirrors the Admin
// Console's own sidebar (AdminConsolePage's NAV_ITEMS) so the nav doesn't visibly swap to
// the lawyer's -- items with no standalone route (Users, Trust, Conflict Search, Reports,
// Analytics, Firm Analytics are tabs inside AdminConsolePage, not pages of their own) go
// back to /admin, same as Dashboard.
const ADMIN_STAFF_NAV: NavDef[] = [
  { label: 'Dashboard', icon: 'grid', path: '/admin' },
  { label: 'Users', icon: 'users', path: '/admin' },
  { label: 'Cases', icon: 'scale', path: '/cases' },
  { label: 'Documents', icon: 'file-text', path: '/documents' },
  { label: 'Billing', icon: 'receipt', path: '/billing' },
  { label: 'Trust', icon: 'shield', path: '/admin' },
  { label: 'Conflict Search', icon: 'shield', path: '/admin' },
  { label: 'Reports', icon: 'bar-chart-2', path: '/admin' },
  { label: 'Analytics', icon: 'pie-chart', path: '/admin' },
  { label: 'Firm Analytics', icon: 'banknote', path: '/admin' },
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchData, setSearchData] = useState<{ cases: CaseSummary[]; clients: ClientSummary[]; documents: DocumentSummary[] } | null>(null)
  const isClient = profile?.role_id === 3

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
    setSearchOpen(false)
  }

  // Loaded once per session on first use, then filtered client-side on every
  // keystroke -- same scoped list endpoints the Cases/Clients/Documents pages
  // already call, so results respect the caller's own role-based access.
  function openSearch() {
    setSearchOpen(true)
    if (searchData) return
    Promise.all([listCases(), isClient ? Promise.resolve([]) : listClients(), listDocuments()])
      .then(([cases, clients, documents]) => setSearchData({ cases, clients, documents }))
      .catch(() => setSearchData({ cases: [], clients: [], documents: [] }))
  }

  const searchLower = searchQuery.trim().toLowerCase()
  const matchedCases = !searchData || !searchLower ? [] : searchData.cases
    .filter((c) => c.id.toLowerCase().includes(searchLower) || (c.case_title ?? '').toLowerCase().includes(searchLower))
    .slice(0, SEARCH_RESULT_LIMIT)
  const matchedClients = !searchData || !searchLower ? [] : searchData.clients
    .filter((c) => c.full_name.toLowerCase().includes(searchLower) || c.email.toLowerCase().includes(searchLower))
    .slice(0, SEARCH_RESULT_LIMIT)
  const matchedDocuments = !searchData || !searchLower ? [] : searchData.documents
    .filter((d) => d.file_name.toLowerCase().includes(searchLower))
    .slice(0, SEARCH_RESULT_LIMIT)
  const hasSearchResults = matchedCases.length > 0 || matchedClients.length > 0 || matchedDocuments.length > 0

  function goToSearchResult(path: string) {
    navigate(path)
    setSearchQuery('')
    setSearchOpen(false)
  }

  const navItems = profile?.role_id === 3 ? CLIENT_NAV : profile?.role_id === 1 || profile?.role_id === 4 ? ADMIN_STAFF_NAV : LAWYER_NAV

  return (
    <div className={styles.page}>
      {sidebarOpen && <div className={styles.sidebarBackdrop} onClick={() => setSidebarOpen(false)} />}
      <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
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
              <button key={item.label} type="button" className={styles.navRow} style={{ background: active ? '#E6E0CE' : 'transparent' }} onClick={() => { navigate(item.path!); setSidebarOpen(false) }} title={item.label} aria-current={active ? 'page' : undefined}>
                <span className={styles.navIcon}><Icon name={item.icon} size={18} color={active ? C.primaryDark : '#8C857A'} /></span>
                <span className={styles.navLabel} style={{ fontWeight: active ? 600 : 500, color: active ? C.text : '#575145' }}>{item.label}</span>
                {item.path === '/messages' && unreadMessages > 0 && (
                  <span className={styles.navBadge}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className={styles.sidebarFooter}>
          <button type="button" className={styles.navRow} style={{ background: location.pathname === '/settings' ? '#E6E0CE' : 'transparent' }} onClick={() => { navigate('/settings'); setSidebarOpen(false) }} title="Settings">
            <span className={styles.navIcon}><Icon name="settings" size={18} color={location.pathname === '/settings' ? C.primaryDark : '#8C857A'} /></span>
            <span className={styles.navLabel} style={{ fontWeight: location.pathname === '/settings' ? 600 : 500, color: location.pathname === '/settings' ? C.text : '#575145' }}>Settings</span>
          </button>
          <button type="button" className={styles.logoutRow} onClick={logout} title="Logout">
            <span className={styles.navIcon}><Icon name="log-out" size={18} color="#8C857A" /></span>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#575145' }}>Logout</span>
          </button>
        </div>
      </div>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <button type="button" className={styles.hamburgerBtn} onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle menu">
            <Icon name="menu" size={20} color="#575145" />
          </button>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <div className={styles.searchBox}>
              <Icon name="search" size={17} color="#8C857A" />
              <input
                placeholder={isClient ? 'Search cases, documents...' : 'Search cases, clients, documents...'}
                className={styles.searchInput}
                value={searchQuery}
                onFocus={openSearch}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
              />
            </div>
            {searchOpen && searchQuery.trim() && (
              <div className={styles.searchDropdown}>
                {!searchData && <div className={styles.searchEmpty}>Loading…</div>}
                {searchData && !hasSearchResults && <div className={styles.searchEmpty}>No matches for "{searchQuery.trim()}".</div>}
                {matchedCases.length > 0 && (
                  <div className={styles.searchGroup}>
                    <div className={styles.searchGroupLabel}>Cases</div>
                    {matchedCases.map((c) => (
                      <button key={c.id} type="button" className={styles.searchResultItem} onClick={() => goToSearchResult(`/cases/${c.case_id}`)}>
                        <Icon name="briefcase" size={14} color="#575145" />
                        <span>{c.case_title ?? c.id}</span>
                      </button>
                    ))}
                  </div>
                )}
                {matchedClients.length > 0 && (
                  <div className={styles.searchGroup}>
                    <div className={styles.searchGroupLabel}>Clients</div>
                    {matchedClients.map((c) => (
                      <button key={c.id} type="button" className={styles.searchResultItem} onClick={() => goToSearchResult(`/clients/${c.id}`)}>
                        <Icon name="users" size={14} color="#575145" />
                        <span>{c.full_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {matchedDocuments.length > 0 && (
                  <div className={styles.searchGroup}>
                    <div className={styles.searchGroupLabel}>Documents</div>
                    {matchedDocuments.map((d) => (
                      <button key={d.id} type="button" className={styles.searchResultItem} onClick={() => goToSearchResult(`/documents/${d.id}`)}>
                        <Icon name="file-text" size={14} color="#575145" />
                        <span>{d.file_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.todayLabel}>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <button type="button" className={styles.bellBtn} onClick={() => navigate('/notifications')} aria-label="Notifications">
              <Icon name="bell" size={19} color="#575145" />
              {notifications.some((n) => !n.is_read) && <span className={styles.bellDot} />}
            </button>
            <div className={styles.vDivider} />
            <div style={{ position: 'relative' }}>
              <button type="button" className={styles.profileBtn} onClick={(e) => { e.stopPropagation(); setProfileOpen((v) => !v) }} aria-haspopup="true" aria-expanded={profileOpen}>
                <div className={styles.avatarCircle}>{profile ? initialsOf(profile.full_name) : '—'}</div>
                <div className={styles.profileNameBlock} style={{ lineHeight: 1.25 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17' }}>{profile?.full_name ?? 'Unknown user'}</div><div style={{ fontSize: 11, color: '#8C857A' }}>{profile ? (ROLE_LABELS[profile.role_id] ?? 'User') : ''}</div></div>
                <span className={styles.profileChevron} style={{ color: '#8C857A', display: 'flex' }}><Icon name="chevron-down" size={15} color="#8C857A" /></span>
              </button>
              {profileOpen && (
                <div className={styles.profileDropdown}>
                  <button type="button" className={styles.profileDropdownItem} onClick={() => navigate('/settings')}>My Profile</button>
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
