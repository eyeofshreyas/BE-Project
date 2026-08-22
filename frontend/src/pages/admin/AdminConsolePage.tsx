import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../../assets/logo.svg'
import { Icon, type IconName } from './icons'
import { C } from './theme'
import DashboardView from './views/DashboardView'
import UsersView from './views/UsersView'
import CasesView from './views/CasesView'
import ReportsView from './views/ReportsView'
import AnalyticsView from './views/AnalyticsView'
import SettingsView from './views/SettingsView'
import styles from './adminShared.module.css'

type PageKey = 'dashboard' | 'users' | 'cases' | 'reports' | 'analytics' | 'settings'

const NAV_ITEMS: { key: PageKey; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'users', label: 'Users', icon: 'users' },
  { key: 'cases', label: 'Cases', icon: 'scale' },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-2' },
  { key: 'analytics', label: 'Analytics', icon: 'pie-chart' },
]

const TOP_NOTIFS = [
  { text: 'Unusual login attempt blocked from a new device', time: '2m ago', color: C.danger },
  { text: '14 new sign-ups today across lawyers and clients', time: '18m ago', color: C.primary },
  { text: 'Translation job failed for CASE-2019', time: '1h ago', color: C.warning },
]

export default function AdminConsolePage() {
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const navigate = useNavigate()

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
              <div key={item.key} className={styles.navRow} style={{ background: active ? '#E9DCC8' : 'transparent' }} onClick={() => goTo(item.key)} title={item.label}>
                <span className={styles.navIcon}><Icon name={item.icon} size={18} color={active ? C.primaryDark : '#93826d'} /></span>
                <span className={styles.navLabel} style={{ fontWeight: active ? 600 : 500, color: active ? C.text : '#6A5C42' }}>{item.label}</span>
              </div>
            )
          })}
        </div>
        <div className={styles.sidebarFooter}>
          <div className={styles.navRow} style={{ background: activePage === 'settings' ? '#E9DCC8' : 'transparent' }} onClick={() => goTo('settings')} title="Settings">
            <span className={styles.navIcon}><Icon name="settings" size={18} color={activePage === 'settings' ? C.primaryDark : '#93826d'} /></span>
            <span className={styles.navLabel} style={{ fontWeight: activePage === 'settings' ? 600 : 500, color: activePage === 'settings' ? C.text : '#6A5C42' }}>Settings</span>
          </div>
          <div className={styles.logoutRow} onClick={() => navigate('/')} title="Logout">
            <span className={styles.navIcon}><Icon name="log-out" size={18} color="#93826d" /></span>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#6A5C42' }}>Logout</span>
          </div>
        </div>
      </div>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.searchBox}>
            <Icon name="search" size={17} color="#A38F66" />
            <input placeholder="Search users, lawyers, clients, cases, documents..." className={styles.searchInput} />
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.todayLabel}>Friday, August 7, 2026</div>
            <div style={{ position: 'relative' }}>
              <div className={styles.bellBtn} style={{ background: notifOpen ? '#EFE4CB' : 'transparent' }} onClick={(e) => { e.stopPropagation(); setNotifOpen((v) => !v); setProfileOpen(false) }}>
                <Icon name="bell" size={19} color="#6A5C42" /><span className={styles.bellDot} />
              </div>
              {notifOpen && (
                <div className={styles.notifDropdown}>
                  <div className={styles.notifDropdownTitle}>Notifications</div>
                  {TOP_NOTIFS.map((n) => (
                    <div key={n.text} className={styles.notifDropdownRow} onClick={() => { goTo('dashboard') }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: n.color }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: '#2A2118', lineHeight: 1.4 }}>{n.text}</div>
                        <div style={{ fontSize: 11, color: '#A38F66', marginTop: 2 }}>{n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.vDivider} />
            <div style={{ position: 'relative' }}>
              <div className={styles.profileBtn} onClick={(e) => { e.stopPropagation(); setProfileOpen((v) => !v); setNotifOpen(false) }}>
                <div className={styles.avatarCircle}>PN</div>
                <div style={{ lineHeight: 1.25 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118' }}>Priya Nair</div><div style={{ fontSize: 11, color: '#A38F66' }}>Super Admin</div></div>
                <span style={{ color: '#A38F66', display: 'flex' }}><Icon name="chevron-down" size={15} color="#A38F66" /></span>
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
          {activePage === 'dashboard' && <DashboardView quickActions={quickActions} />}
          {activePage === 'users' && <UsersView />}
          {activePage === 'cases' && <CasesView />}
          {activePage === 'reports' && <ReportsView />}
          {activePage === 'analytics' && <AnalyticsView />}
          {activePage === 'settings' && <SettingsView onSave={() => showToast('Settings saved.')} />}
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
