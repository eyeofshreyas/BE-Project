/** `/settings` route (lawyer & client): rendered inside the shared `AppLayout` shell like
 * every other page, using the same card/field components as the rest of the app instead of
 * a bespoke topbar/sidebar -- this used to render standalone and drifted visually from the
 * rest of the app (and looked broken once its fake sections were removed, since its
 * min-height:100vh shell assumed a lot more content than four small cards).
 * Profile (name/phone via `updateOwnProfile()`) and password-reset (`forgotPassword()`)
 * are real, mirroring the admin console's own Settings tab (`admin/views/SettingsView.tsx`).
 * Appearance is a per-browser preference only -- there's no dark palette rendered yet. */
import { useState } from 'react'
import { Icon, type IconName } from '../../components/icons'
import { C } from '../../components/theme'
import { forgotPassword, updateOwnProfile } from '../../api/client'
import type { UserProfile } from '../../types/api'
import styles from '../../components/AppShell.module.css'

const THEME_KEY = 'lexflow_theme'
const ROLE_LABELS: Record<number, string> = { 2: 'Lawyer', 3: 'Client' }

type Theme = 'Light' | 'Dark' | 'System'

const MENU: { key: string; label: string; icon: IconName }[] = [
  { key: 'profile', label: 'Profile', icon: 'user' },
  { key: 'security', label: 'Security', icon: 'shield' },
  { key: 'appearance', label: 'Appearance', icon: 'palette' },
  { key: 'about', label: 'About', icon: 'info' },
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
 * Left-nav-switched settings panels, structurally identical to the admin console's own
 * Settings tab. Profile fields seed from the cached `lexflow_profile`; "Save Changes"
 * writes name/phone back via `updateOwnProfile()` and the theme choice to `localStorage`.
 */
export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(loadProfile)
  const [tab, setTab] = useState('profile')
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'Light')

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

  const cardStyle = { background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 24, boxShadow: '0 1px 2px rgba(35, 48, 107,.04)', display: 'flex', flexDirection: 'column' as const, gap: 16 }
  const fieldLabel = { fontSize: 12.5, fontWeight: 600, color: '#575145', marginBottom: 7 }
  const inputWrap = { display: 'flex', alignItems: 'center', gap: 9, background: '#F6F2E9', border: `1.5px solid ${C.border}`, borderRadius: 3, padding: '11px 13px' }
  const inputStyle = { border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 13.5, color: C.text, fontFamily: "'Public Sans',sans-serif", minWidth: 0 }
  const rowLastStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 2px' }
  const rowTitle = { fontSize: 13.5, fontWeight: 600, color: C.text }
  const rowDesc = { fontSize: 12, color: C.muted, marginTop: 2 }
  const btnGhost = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: '#FCFAF4', color: C.text, border: `1px solid ${C.border}` }
  const btnPrimary = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, background: C.primary, color: '#FCFAF4', boxShadow: '0 4px 12px rgba(35, 48, 107,.28)' }

  const initials = initialsOf(fullName || '—')
  const roleLabel = profile ? (ROLE_LABELS[profile.role_id] ?? 'User') : ''

  return (
    <div style={{ padding: '32px 40px 40px', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div>
        <div className={styles.pageTitle}>Settings</div>
        <div className={styles.pageSubtitle}>Manage your account and application preferences.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {MENU.map((m) => {
            const active = tab === m.key
            return (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 3, cursor: 'pointer', background: active ? '#F6EFDD' : 'transparent' }} onClick={() => setTab(m.key)}>
                <span style={{ display: 'flex', flexShrink: 0 }}><Icon name={m.icon} size={17} color={active ? C.primaryDark : '#8C857A'} /></span>
                <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? C.text : '#575145' }}>{m.label}</span>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {tab === 'profile' && (
            <div style={cardStyle}>
              <div className={styles.cardTitle}>Profile</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 56, height: 56, borderRadius: 3, background: 'linear-gradient(135deg,#23306B,#CFC6B0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FCFAF4', fontFamily: "'Spectral',serif", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>{initials}</div>
                <div><div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fullName || '—'}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{roleLabel}</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div><div style={fieldLabel}>Full Name</div><div style={inputWrap}><Icon name="user" size={16} color={C.muted} /><input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} /></div></div>
                <div>
                  <div style={fieldLabel}>Email Address</div>
                  {/* Read-only: email is the only link between a users row and its Supabase Auth
                      account, so editing it here alone would lock the account out. */}
                  <div style={{ ...inputWrap, background: '#EFEBE0' }}><Icon name="mail" size={16} color={C.muted} /><input value={profile?.email ?? ''} readOnly style={{ ...inputStyle, color: C.muted }} /></div>
                </div>
              </div>
              <div><div style={fieldLabel}>Phone Number</div><div style={inputWrap}><Icon name="phone" size={16} color={C.muted} /><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></div></div>
            </div>
          )}

          {tab === 'security' && (
            <div style={cardStyle}>
              <div className={styles.cardTitle}>Security</div>
              <div style={rowLastStyle}>
                <div><div style={rowTitle}>Password</div><div style={rowDesc}>Email a reset link to {profile?.email ?? 'your account'}.</div></div>
                <div style={btnGhost} onClick={sendPasswordReset}>Send reset link</div>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div style={cardStyle}>
              <div className={styles.cardTitle}>Appearance</div>
              <div>
                <div style={fieldLabel}>Theme</div>
                <div style={{ display: 'flex', gap: 6, background: '#F6F2E9', border: `1px solid ${C.border}`, borderRadius: 3, padding: 4 }}>
                  {(['Light', 'Dark', 'System'] as const).map((t) => (
                    <div key={t} style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, padding: 11, borderRadius: 3, cursor: 'pointer', background: theme === t ? C.primary : 'transparent', color: theme === t ? '#FCFAF4' : C.text }} onClick={() => setTheme(t)}>{t}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Saved in this browser only.</div>
              </div>
            </div>
          )}

          {tab === 'about' && (
            <div style={cardStyle}>
              <div className={styles.cardTitle}>About LexFlow</div>
              <div style={rowLastStyle}><div style={rowTitle}>Platform Version</div><div style={{ fontSize: 13.5, color: C.muted }}>2.4.1 (Build 2026.08.05)</div></div>
            </div>
          )}

          <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: '16px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <div style={btnGhost} onClick={reset}>Cancel</div>
            <div style={btnPrimary} onClick={() => { if (!saving) save() }}>{saving ? 'Saving…' : 'Save Changes'}</div>
          </div>
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
