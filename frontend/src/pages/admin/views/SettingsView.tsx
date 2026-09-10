/** Admin console "Settings" tab: tabbed profile/security/platform/appearance/about panels backed entirely by local state (no API persistence -- "Save" just calls `onSave`). */
import { useState } from 'react'
import { Icon, type IconName } from '../../../components/icons'
import { C } from '../../../components/theme'
import styles from '../../../components/AppShell.module.css'

const MENU: { key: string; label: string; icon: IconName }[] = [
  { key: 'profile', label: 'Profile', icon: 'user' },
  { key: 'security', label: 'Security', icon: 'shield' },
  { key: 'platform', label: 'Platform', icon: 'settings' },
  { key: 'appearance', label: 'Appearance', icon: 'palette' },
  { key: 'about', label: 'About', icon: 'info' },
]

/** Small controlled on/off switch (sliding dot) used throughout this view's toggle rows. */
function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div className={styles.toggleTrack} style={{ width: 40, height: 22, background: value ? C.primary : C.border, justifyContent: value ? 'flex-end' : 'flex-start' }} onClick={onChange}>
      <div className={styles.toggleDot} style={{ width: 18, height: 18 }} />
    </div>
  )
}

/** Left-nav-switched settings panels, all driven by local `useState` (no backend calls); "Save Changes" invokes `onSave` (parent shows a toast). */
export default function SettingsView({ onSave }: { onSave: () => void }) {
  const [tab, setTab] = useState('profile')
  const [fullName, setFullName] = useState('Priya Nair')
  const [email, setEmail] = useState('admin@lexflow.in')
  const [phone, setPhone] = useState('+91 98200 11223')
  const [twoFA, setTwoFA] = useState(true)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [newSignupAlerts, setNewSignupAlerts] = useState(true)
  const [weeklyReports, setWeeklyReports] = useState(true)
  const [autoBackup, setAutoBackup] = useState(true)
  const [theme, setTheme] = useState<'Light' | 'Dark' | 'System'>('Light')

  const cardStyle = { background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 24, boxShadow: '0 1px 2px rgba(35, 48, 107,.04)', display: 'flex', flexDirection: 'column' as const, gap: 16 }
  const fieldLabel = { fontSize: 12.5, fontWeight: 600, color: '#575145', marginBottom: 7 }
  const inputWrap = { display: 'flex', alignItems: 'center', gap: 9, background: '#F6F2E9', border: `1.5px solid ${C.border}`, borderRadius: 3, padding: '11px 13px' }
  const inputStyle = { border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 13.5, color: C.text, fontFamily: "'Public Sans',sans-serif", minWidth: 0 }
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 2px', borderBottom: `1px solid ${C.border}` }
  const rowLastStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 2px' }
  const rowTitle = { fontSize: 13.5, fontWeight: 600, color: C.text }
  const rowDesc = { fontSize: 12, color: C.muted, marginTop: 2 }
  const btnGhost = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: '#FCFAF4', color: C.text, border: `1px solid ${C.border}` }
  const btnPrimary = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: C.primary, color: '#FCFAF4', boxShadow: '0 4px 12px rgba(35, 48, 107,.28)' }

  const adminInitials = fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Platform Settings</div>
        <div className={styles.pageSubtitle}>Manage your admin account, platform configuration and preferences.</div>
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
              <div className={styles.cardTitle}>Admin Profile</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 56, height: 56, borderRadius: 3, background: 'linear-gradient(135deg,#23306B,#CFC6B0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FCFAF4', fontFamily: "'Spectral',serif", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>{adminInitials}</div>
                <div><div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fullName}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Super Admin</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div><div style={fieldLabel}>Full Name</div><div style={inputWrap}><Icon name="user" size={16} color={C.muted} /><input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} /></div></div>
                <div><div style={fieldLabel}>Email Address</div><div style={inputWrap}><Icon name="mail" size={16} color={C.muted} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></div></div>
              </div>
              <div><div style={fieldLabel}>Phone Number</div><div style={inputWrap}><Icon name="phone" size={16} color={C.muted} /><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></div></div>
            </div>
          )}

          {tab === 'security' && (
            <div style={cardStyle}>
              <div className={styles.cardTitle}>Security</div>
              <div style={rowLastStyle}>
                <div><div style={rowTitle}>Two-Factor Authentication</div><div style={rowDesc}>Require a verification code at sign-in.</div></div>
                <Toggle value={twoFA} onChange={() => setTwoFA((v) => !v)} />
              </div>
            </div>
          )}

          {tab === 'platform' && (
            <div style={cardStyle}>
              <div className={styles.cardTitle}>Platform Configuration</div>
              <div style={rowStyle}><div><div style={rowTitle}>Maintenance Mode</div><div style={rowDesc}>Temporarily block user access during upkeep.</div></div><Toggle value={maintenanceMode} onChange={() => setMaintenanceMode((v) => !v)} /></div>
              <div style={rowStyle}><div><div style={rowTitle}>New Signup Alerts</div><div style={rowDesc}>Notify admins when a new user registers.</div></div><Toggle value={newSignupAlerts} onChange={() => setNewSignupAlerts((v) => !v)} /></div>
              <div style={rowStyle}><div><div style={rowTitle}>Weekly Reports</div><div style={rowDesc}>Email a platform summary report every week.</div></div><Toggle value={weeklyReports} onChange={() => setWeeklyReports((v) => !v)} /></div>
              <div style={rowLastStyle}><div><div style={rowTitle}>Automatic Backups</div><div style={rowDesc}>Back up platform data daily.</div></div><Toggle value={autoBackup} onChange={() => setAutoBackup((v) => !v)} /></div>
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
            <div style={btnGhost}>Cancel</div>
            <div style={btnPrimary} onClick={onSave}>Save Changes</div>
          </div>
        </div>
      </div>
    </>
  )
}
