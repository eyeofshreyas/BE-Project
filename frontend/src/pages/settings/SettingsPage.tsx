/** `/settings` route (lawyer & client): renders its own topbar/sidebar shell (opts out of
 * `AppLayout`). Profile (name/phone) and password-reset are real, calling the same
 * `updateOwnProfile()`/`forgotPassword()` the admin console's own Settings tab uses.
 * Appearance is a per-browser preference only -- there's no dark palette rendered yet.
 * Organization/team/regional/notification/AI preferences were dropped: none of them have
 * a backing model anywhere in the app, so keeping their controls would just be decoration
 * that saves nowhere. */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../../assets/logo.svg'
import styles from './SettingsPage.module.css'
import { Icon } from '../../components/icons'
import { forgotPassword, listNotifications, updateOwnProfile } from '../../api/client'
import type { NotificationSummary, UserProfile } from '../../types/api'

const PRIMARY = '#1A2551'
const MUTED = '#8C857A'
const THEME_KEY = 'lexflow_theme'
const ROLE_LABELS: Record<number, string> = { 2: 'Lawyer', 3: 'Client' }

type Theme = 'Light' | 'Dark' | 'System'

const iconProps = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const HelpCircleIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={9} /><path d="M9.1 9a3 3 0 1 1 4.6 2.4c-.8.5-1.5 1.1-1.5 2.1" /><path d="M12 17h.01" /></svg>
const SunIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={4} /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
const MoonIcon = () => <svg {...iconProps}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" /></svg>
const ChevronRightIcon = () => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#8C857A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>

const MENU = [
  { key: 'profile', label: 'Profile', icon: <Icon name="user" size={17} /> },
  { key: 'security', label: 'Security', icon: <Icon name="shield" size={17} /> },
  { key: 'appearance', label: 'Appearance', icon: <Icon name="palette" size={17} /> },
  { key: 'about', label: 'About', icon: <Icon name="info" size={17} /> },
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.inputWrap}>{children}</div>
    </div>
  )
}

/**
 * Sidebar-tabbed settings shell mirroring `admin/views/SettingsView.tsx`'s real-data
 * pattern. "Save Changes" persists name/phone via `updateOwnProfile()` and the theme
 * choice to `localStorage`; "Cancel" reverts the form to the last-loaded profile.
 */
export default function SettingsPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(loadProfile)
  const [activeSection, setActiveSection] = useState('profile')
  const [notifOpen, setNotifOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationSummary[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'Light')

  useEffect(() => {
    listNotifications().then(setNotifications).catch(() => {})
  }, [])

  const activeLabel = MENU.find((m) => m.key === activeSection)?.label ?? 'Profile'

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1600)
  }

  function reset() {
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setTheme((localStorage.getItem(THEME_KEY) as Theme | null) ?? 'Light')
    showToast('Changes discarded.')
  }

  async function save() {
    setSaving(true)
    try {
      const updated = await updateOwnProfile({ full_name: fullName.trim(), phone: phone.trim() })
      const merged = profile ? { ...profile, full_name: updated.full_name, phone: updated.phone } : profile
      if (merged) {
        setProfile(merged)
        localStorage.setItem('lexflow_profile', JSON.stringify(merged))
      }
      localStorage.setItem(THEME_KEY, theme)
      showToast('Settings saved.')
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function sendPasswordReset() {
    if (!profile) return
    try {
      await forgotPassword(profile.email)
      showToast(`Password reset link sent to ${profile.email}.`)
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  function logout() {
    localStorage.removeItem('lexflow_token')
    localStorage.removeItem('lexflow_profile')
    navigate('/login')
  }

  const initials = initialsOf(profile?.full_name ?? '—')
  const roleLabel = profile ? (ROLE_LABELS[profile.role_id] ?? 'User') : ''

  return (
    <div className={styles.page} onClick={() => { setNotifOpen(false); setAvatarOpen(false) }}>
      <div className={styles.topbar} onClick={(e) => e.stopPropagation()}>
        <div className={styles.topbarLeft}>
          <div className={styles.brandRow}>
            <img src={logo} alt="LexFlow" className={styles.logo} />
            <div className={styles.brandName}>LexFlow</div>
          </div>
          <div className={styles.searchBox}>
            <Icon name="search" size={15} color={MUTED} />
            <input placeholder="Search settings..." disabled className={styles.searchInput} />
          </div>
        </div>
        <div className={styles.breadcrumb}>
          <span>Settings</span><ChevronRightIcon /><span className={styles.breadcrumbActive}>{activeLabel}</span>
        </div>
        <div className={styles.topbarRight}>
          <div className={styles.iconBtn} title="Help"><HelpCircleIcon /></div>
          <div style={{ position: 'relative' }}>
            <div className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); setNotifOpen((v) => !v); setAvatarOpen(false) }} title="Notifications">
              <Icon name="bell" size={17} />
              {notifications.some((n) => !n.is_read) && <span className={styles.notifDot} />}
            </div>
            {notifOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropdownTitle}>Notifications</div>
                {notifications.length === 0
                  ? <div className={styles.dropdownEmpty}>You're all caught up. No new notifications.</div>
                  : <div className={styles.dropdownMenuItem} onClick={() => navigate('/notifications')}>View all notifications</div>}
              </div>
            )}
          </div>
          <div className={styles.iconBtn} onClick={() => setTheme((t) => (t === 'Dark' ? 'Light' : 'Dark'))} title="Toggle theme">
            {theme === 'Dark' ? <MoonIcon /> : <SunIcon />}
          </div>
          <div className={styles.vDivider} />
          <div style={{ position: 'relative' }}>
            <div className={styles.avatarRow} onClick={(e) => { e.stopPropagation(); setAvatarOpen((v) => !v); setNotifOpen(false) }}>
              <div className={styles.avatar}>{initials}</div>
              <Icon name="chevron-down" size={14} color="#8C857A" />
            </div>
            {avatarOpen && (
              <div className={styles.dropdownMenu}>
                <div className={styles.dropdownMenuItem} onClick={() => setActiveSection('profile')}>My Profile</div>
                <div className={styles.dropdownMenuItemDanger} onClick={logout}>Sign Out</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.sidebar}>
          {MENU.map((m) => {
            const active = activeSection === m.key
            return (
              <div key={m.key} className={styles.menuRow} style={{ background: active ? '#EFE3C4' : 'transparent' }} onClick={() => setActiveSection(m.key)}>
                <div className={styles.menuIndicator} style={{ height: active ? 18 : 0 }} />
                <span style={{ color: active ? PRIMARY : '#8A8478', display: 'flex' }}>{m.icon}</span>
                <span className={styles.menuLabel} style={{ fontWeight: active ? 700 : 600, color: active ? '#33302A' : '#5B5344' }}>{m.label}</span>
              </div>
            )
          })}
        </div>

        <div className={styles.content}>
          <div>
            <div className={styles.pageTitle}>Settings</div>
            <div className={styles.pageSubtitle}>Manage your account and application preferences.</div>
          </div>

          {activeSection === 'profile' && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}>
                <div><div className={styles.cardTitle}>Profile</div><div className={styles.cardDesc}>Your personal details.</div></div>
              </div>
              <div className={styles.profileRow}>
                <div className={styles.profileAvatar}>{initials}</div>
                <div><div className={styles.profileName}>{profile?.full_name ?? '—'}</div><div className={styles.profileMeta}>{roleLabel}</div></div>
              </div>
              <div className={styles.fieldsGrid}>
                <Field label="Full Name"><Icon name="user" size={16} color="#8C857A" /><input value={fullName} onChange={(e) => setFullName(e.target.value)} className={styles.input} /></Field>
                <Field label="Phone"><Icon name="phone" size={16} color="#8C857A" /><input value={phone} onChange={(e) => setPhone(e.target.value)} className={styles.input} /></Field>
                <Field label="Email">
                  {/* Read-only: email is the only link between a users row and its Supabase
                      Auth account, so editing it here alone would lock the account out. */}
                  <Icon name="mail" size={16} color="#8C857A" /><input value={profile?.email ?? ''} readOnly className={styles.input} style={{ color: MUTED }} />
                </Field>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>Security</div><div className={styles.cardDesc}>Password and sign-in.</div></div></div>
              <div className={styles.rowLast}>
                <div><div className={styles.rowTitle}>Password</div><div className={styles.rowDesc}>Email a reset link to {profile?.email ?? 'your account'}.</div></div>
                <div className={styles.btnSecondary} onClick={sendPasswordReset}>Send reset link</div>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>Appearance</div><div className={styles.cardDesc}>Choose how LexFlow looks on this device.</div></div></div>
              <div className={styles.themeSeg}>
                {(['Light', 'Dark', 'System'] as const).map((t) => (
                  <div key={t} className={styles.themeSegOption} style={{ background: theme === t ? PRIMARY : 'transparent', color: theme === t ? '#FCFAF4' : '#33302A' }} onClick={() => setTheme(t)}>{t}</div>
                ))}
              </div>
              <div className={styles.cardDesc} style={{ marginTop: 8 }}>Saved in this browser only.</div>
            </div>
          )}

          {activeSection === 'about' && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>About LexFlow</div><div className={styles.cardDesc}>Platform version and support resources.</div></div></div>
              <div className={styles.rowBorder}><div className={styles.rowTitle}>Version</div><div className={styles.mono}>2.4.1 (Build 2026.08.05)</div></div>
              <div className={styles.rowLast}><div style={{ display: 'flex', gap: 16 }}><a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a><a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a><a href="#" onClick={(e) => e.preventDefault()}>Help Center</a></div></div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.footerBar}>
        <div className={styles.footerLeft} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div className={styles.btnSecondary} onClick={reset}>Cancel</div>
          <div className={styles.btnPrimary} onClick={() => { if (!saving) save() }}>{saving ? 'Saving…' : 'Save Changes'}</div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
