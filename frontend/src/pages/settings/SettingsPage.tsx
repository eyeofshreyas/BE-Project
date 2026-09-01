import { useState } from 'react'
import logo from '../../assets/logo.svg'
import styles from './SettingsPage.module.css'
import { Icon } from '../../components/icons'

const PRIMARY = '#B58A2F'
const MUTED = '#9CA3AF'

const iconProps = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const SlidersIcon = () => <svg {...iconProps}><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" /></svg>
const Building2Icon = () => <svg {...iconProps}><path d="M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" /><path d="M14 21V9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v12" /></svg>
const HelpCircleIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={9} /><path d="M9.1 9a3 3 0 1 1 4.6 2.4c-.8.5-1.5 1.1-1.5 2.1" /><path d="M12 17h.01" /></svg>
const SunIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={4} /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
const MoonIcon = () => <svg {...iconProps}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" /></svg>
const ChevronRightIcon = () => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
const GlobeIconSm = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={9} /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></svg>
const ClockIconSm = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={9} /><path d="M12 7v5l4 2" /></svg>
const DollarIconSm = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.6-5 3.5 2.2 3 5 3.5c2.8.5 5 1.6 5 3.5s-2.2 3.5-5 3.5-5-1.6-5-3.5" /></svg>
const LockIconLg = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={4} y={11} width={16} height={9} rx={2} /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
const MonitorIconLg = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={2} y={4} width={20} height={13} rx={2} /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
const SmartphoneIconLg = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={6} y={2} width={12} height={20} rx={2} /><path d="M11 18h2" /></svg>
const MessageSquareIconSm = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v12H8l-4 4z" /></svg>
const CreditCardIconSm = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={2} y={5} width={20} height={14} rx={2} /><path d="M2 10h20" /><path d="M6 15h4" /></svg>

const MENU = [
  { key: 'general', label: 'General', icon: <SlidersIcon /> },
  { key: 'profile', label: 'Profile', icon: <Icon name="user" size={17} /> },
  { key: 'organization', label: 'Organization', icon: <Building2Icon /> },
  { key: 'teammembers', label: 'Team Members', icon: <Icon name="users" size={17} /> },
  { key: 'security', label: 'Security', icon: <Icon name="shield" size={17} /> },
]

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{ width: 44, height: 26, borderRadius: 20, padding: 2, cursor: 'pointer', background: value ? PRIMARY : '#E8E5DF', display: 'flex', justifyContent: value ? 'flex-end' : 'flex-start', flexShrink: 0, transition: 'background .15s' }}
    >
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 2px 4px rgba(0,0,0,.2)' }} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.inputWrap}>{children}</div>
    </div>
  )
}

function ToggleRow({ icon, title, desc, value, onChange, last }: { icon?: React.ReactNode; title: string; desc?: string; value: boolean; onChange: () => void; last?: boolean }) {
  return (
    <div className={last ? styles.rowLast : styles.rowBorder}>
      <div className={styles.rowLeft}>
        {icon}
        <div>
          <div className={styles.rowTitle}>{title}</div>
          {desc && <div className={styles.rowDesc}>{desc}</div>}
        </div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general')
  const [searchQuery, setSearchQuery] = useState('')
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light')
  const [notifOpen, setNotifOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [pName] = useState('Meera Kulkarni')
  const [pEmail, setPEmail] = useState('meera.kulkarni@lexflow.in')
  const [pPhone, setPPhone] = useState('+91 98765 43210')
  const [pDesignation, setPDesignation] = useState('Managing Partner')

  const [rLanguage, setRLanguage] = useState('English (US)')
  const [rTimezone, setRTimezone] = useState('Asia/Kolkata (GMT+5:30)')
  const [rDateFormat, setRDateFormat] = useState('DD/MM/YYYY')
  const [rTimeFormat, setRTimeFormat] = useState('24-hour')
  const [rCurrency, setRCurrency] = useState('INR (₹)')
  const [rWeekStart, setRWeekStart] = useState('Monday')

  const [sec2FA, setSec2FA] = useState(true)
  const [nEmail, setNEmail] = useState(true)
  const [nDesktop, setNDesktop] = useState(true)
  const [nSMS, setNSMS] = useState(false)
  const [nWeeklyReports, setNWeeklyReports] = useState(true)
  const [nCaseUpdates, setNCaseUpdates] = useState(true)
  const [nAiInsights, setNAiInsights] = useState(true)
  const [nBillingAlerts, setNBillingAlerts] = useState(true)

  const [aiEnableSuggestions, setAiEnableSuggestions] = useState(true)
  const [aiPreferredModel, setAiPreferredModel] = useState('Claude Opus 4')
  const [aiResponseStyle, setAiResponseStyle] = useState('Professional')
  const [aiCitationFormat, setAiCitationFormat] = useState('Bluebook')
  const [aiAutoDraft, setAiAutoDraft] = useState(false)
  const [aiAutoSummaries, setAiAutoSummaries] = useState(true)

  const [appearanceTheme, setAppearanceTheme] = useState<'Light' | 'Dark' | 'System'>('Light')

  const wStorageUsed = 184
  const wStorageTotal = 500

  const activeLabel = MENU.find((m) => m.key === activeSection)?.label || 'General'
  const showGeneral = activeSection === 'general'
  const showProfile = showGeneral || activeSection === 'profile'
  const showSecurity = showGeneral || activeSection === 'security'
  const showNotifications = showGeneral
  const showAi = showGeneral
  const showWorkspace = showGeneral || activeSection === 'organization'

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true) }
  }
  function toggleDirty(setter: (fn: (v: boolean) => boolean) => void) {
    return () => { setter((v) => !v); setDirty(true) }
  }

  function saveChanges() {
    setDirty(false)
    setToast('Settings saved.')
    setTimeout(() => setToast(null), 1600)
  }
  function cancelChanges() {
    setDirty(false)
    setToast('Changes discarded.')
    setTimeout(() => setToast(null), 1600)
  }

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
            <input placeholder="Search settings..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={styles.searchInput} />
          </div>
        </div>
        <div className={styles.breadcrumb}>
          <span>Settings</span><ChevronRightIcon /><span className={styles.breadcrumbActive}>{activeLabel}</span>
        </div>
        <div className={styles.topbarRight}>
          <div className={styles.iconBtn} title="Help"><HelpCircleIcon /></div>
          <div style={{ position: 'relative' }}>
            <div className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); setNotifOpen((v) => !v); setAvatarOpen(false) }} title="Notifications">
              <Icon name="bell" size={17} /><span className={styles.notifDot} />
            </div>
            {notifOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropdownTitle}>Notifications</div>
                <div className={styles.dropdownEmpty}>You're all caught up. No new notifications.</div>
              </div>
            )}
          </div>
          <div className={styles.iconBtn} onClick={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))} title="Toggle theme">
            {themeMode === 'light' ? <SunIcon /> : <MoonIcon />}
          </div>
          <div className={styles.vDivider} />
          <div style={{ position: 'relative' }}>
            <div className={styles.avatarRow} onClick={(e) => { e.stopPropagation(); setAvatarOpen((v) => !v); setNotifOpen(false) }}>
              <div className={styles.avatar}>MK</div>
              <Icon name="chevron-down" size={14} color="#6B7280" />
            </div>
            {avatarOpen && (
              <div className={styles.dropdownMenu}>
                <div className={styles.dropdownMenuItem}>My Profile</div>
                <div className={styles.dropdownMenuItemDanger}>Sign Out</div>
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
                <span className={styles.menuLabel} style={{ fontWeight: active ? 700 : 600, color: active ? '#1F2937' : '#5B5344' }}>{m.label}</span>
              </div>
            )
          })}
        </div>

        <div className={styles.content}>
          <div>
            <div className={styles.pageTitle}>Settings</div>
            <div className={styles.pageSubtitle}>Manage your account, workspace and application preferences.</div>
          </div>

          {showProfile && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}>
                <div><div className={styles.cardTitle}>Profile</div><div className={styles.cardDesc}>Your personal and professional details.</div></div>
                <div className={styles.btnSecondary}><Icon name="edit" size={14} /><span>Edit Profile</span></div>
              </div>
              <div className={styles.profileRow}>
                <div className={styles.profileAvatar}>MK</div>
                <div><div className={styles.profileName}>{pName}</div><div className={styles.profileMeta}>{pDesignation} · Kulkarni & Associates</div></div>
              </div>
              <div className={styles.fieldsGrid}>
                <Field label="Email"><Icon name="mail" size={16} color="#9CA3AF" /><input value={pEmail} onChange={(e) => markDirty(setPEmail)(e.target.value)} className={styles.input} /></Field>
                <Field label="Phone"><Icon name="phone" size={16} color="#9CA3AF" /><input value={pPhone} onChange={(e) => markDirty(setPPhone)(e.target.value)} className={styles.input} /></Field>
                <Field label="Designation"><Icon name="briefcase" size={16} color="#9CA3AF" /><input value={pDesignation} onChange={(e) => markDirty(setPDesignation)(e.target.value)} className={styles.input} /></Field>
              </div>
            </div>
          )}

          {showGeneral && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}>
                <div><div className={styles.cardTitle}>Regional Preferences</div><div className={styles.cardDesc}>Language, time and formatting defaults.</div></div>
              </div>
              <div className={styles.fieldsGrid}>
                <Field label="Language"><GlobeIconSm /><select value={rLanguage} onChange={(e) => markDirty(setRLanguage)(e.target.value)} className={styles.select}>{['English (US)', 'English (UK)', 'Hindi', 'Tamil', 'Marathi'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
                <Field label="Timezone"><GlobeIconSm /><select value={rTimezone} onChange={(e) => markDirty(setRTimezone)(e.target.value)} className={styles.select}>{['Asia/Kolkata (GMT+5:30)', 'America/New_York (GMT-5)', 'Europe/London (GMT+0)'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
                <Field label="Date Format"><Icon name="calendar" size={16} color="#9CA3AF" /><select value={rDateFormat} onChange={(e) => markDirty(setRDateFormat)(e.target.value)} className={styles.select}>{['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
                <Field label="Time Format"><ClockIconSm /><select value={rTimeFormat} onChange={(e) => markDirty(setRTimeFormat)(e.target.value)} className={styles.select}>{['24-hour', '12-hour'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
                <Field label="Currency"><DollarIconSm /><select value={rCurrency} onChange={(e) => markDirty(setRCurrency)(e.target.value)} className={styles.select}>{['INR (₹)', 'USD ($)', 'GBP (£)'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
                <Field label="Week Starts On"><Icon name="calendar" size={16} color="#9CA3AF" /><select value={rWeekStart} onChange={(e) => markDirty(setRWeekStart)(e.target.value)} className={styles.select}>{['Monday', 'Sunday'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
              </div>
            </div>
          )}

          {showSecurity && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>Security Overview</div><div className={styles.cardDesc}>Password, authentication and device management.</div></div></div>
              <div className={styles.rowBorder}><div className={styles.rowLeft}><LockIconLg /><div><div className={styles.rowTitle}>Password</div><div className={styles.rowDesc}>Last changed 32 days ago</div></div></div><div className={styles.btnSecondary}>Change Password</div></div>
              <ToggleRow icon={<Icon name="shield" color={PRIMARY} />} title="Two-Factor Authentication" desc="Extra layer of protection at sign-in." value={sec2FA} onChange={toggleDirty(setSec2FA)} />
              <div className={styles.rowBorder}><div className={styles.rowLeft}><MonitorIconLg /><div><div className={styles.rowTitle}>Login Sessions</div><div className={styles.rowDesc}>3 active sessions across devices.</div></div></div><div className={styles.btnSecondary}>View Sessions</div></div>
              <div className={styles.rowBorder}><div className={styles.rowLeft}><SmartphoneIconLg /><div><div className={styles.rowTitle}>Trusted Devices</div><div className={styles.rowDesc}>2 devices trusted for quick sign-in.</div></div></div><div className={styles.btnSecondary}>Manage Devices</div></div>
              <div className={styles.rowLast}><div className={styles.rowLeft}><Icon name="mail" size={16} color="#9CA3AF" /><div><div className={styles.rowTitle}>Recovery Methods</div><div className={styles.rowDesc}>Backup email and recovery codes configured.</div></div></div><span className={styles.badgeGreen}>Set up</span></div>
            </div>
          )}

          {showNotifications && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>Notifications</div><div className={styles.cardDesc}>Choose how LexFlow keeps you informed.</div></div></div>
              <ToggleRow icon={<Icon name="mail" size={16} color="#9CA3AF" />} title="Email" value={nEmail} onChange={toggleDirty(setNEmail)} />
              <ToggleRow icon={<MonitorIconLg />} title="Desktop" value={nDesktop} onChange={toggleDirty(setNDesktop)} />
              <ToggleRow icon={<MessageSquareIconSm />} title="SMS" value={nSMS} onChange={toggleDirty(setNSMS)} />
              <ToggleRow icon={<Icon name="file-text" size={16} color="#9CA3AF" />} title="Weekly Reports" value={nWeeklyReports} onChange={toggleDirty(setNWeeklyReports)} />
              <ToggleRow icon={<Icon name="briefcase" size={16} color="#9CA3AF" />} title="Case Updates" value={nCaseUpdates} onChange={toggleDirty(setNCaseUpdates)} />
              <ToggleRow icon={<Icon name="sparkles" color={PRIMARY} />} title="AI Insights" value={nAiInsights} onChange={toggleDirty(setNAiInsights)} />
              <ToggleRow icon={<CreditCardIconSm />} title="Billing Alerts" value={nBillingAlerts} onChange={toggleDirty(setNBillingAlerts)} last />
            </div>
          )}

          {showAi && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>AI Preferences</div><div className={styles.cardDesc}>Tune how the LexFlow AI Assistant works for you.</div></div></div>
              <ToggleRow icon={<Icon name="sparkles" color={PRIMARY} />} title="Enable AI Suggestions" desc="Smart next-step suggestions across cases." value={aiEnableSuggestions} onChange={toggleDirty(setAiEnableSuggestions)} />
              <div className={styles.fieldsGrid} style={{ paddingTop: 16 }}>
                <Field label="Preferred Model"><Icon name="sparkles" color={PRIMARY} /><select value={aiPreferredModel} onChange={(e) => markDirty(setAiPreferredModel)(e.target.value)} className={styles.select}>{['Claude Opus 4', 'Claude Sonnet 4', 'Claude Haiku'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
                <Field label="Response Style"><select value={aiResponseStyle} onChange={(e) => markDirty(setAiResponseStyle)(e.target.value)} className={styles.select}>{['Professional', 'Concise', 'Detailed'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
                <Field label="Legal Citation Format"><Icon name="file-text" size={16} color="#9CA3AF" /><select value={aiCitationFormat} onChange={(e) => markDirty(setAiCitationFormat)(e.target.value)} className={styles.select}>{['Bluebook', 'ALWD', 'OSCOLA'].map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevron-down" size={14} color="#9CA3AF" /></Field>
              </div>
              <ToggleRow title="Auto Draft" value={aiAutoDraft} onChange={toggleDirty(setAiAutoDraft)} />
              <ToggleRow title="Auto Summaries" value={aiAutoSummaries} onChange={toggleDirty(setAiAutoSummaries)} last />
            </div>
          )}

          {showWorkspace && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>Workspace</div><div className={styles.cardDesc}>Firm details, plan and storage.</div></div><span className={styles.badgeGreen}>Enterprise</span></div>
              <div className={styles.fieldsGrid}>
                <Field label="Firm Name"><Building2Icon /><input defaultValue="Kulkarni & Associates" onChange={() => setDirty(true)} className={styles.input} /></Field>
                <Field label="Workspace ID"><span className={styles.mono}>wsp_8f2a91c4</span></Field>
              </div>
              <div className={styles.rowBorder}><div className={styles.rowTitle}>Storage Usage</div><div className={styles.storageText}>{wStorageUsed} GB / {wStorageTotal} GB</div></div>
              <div className={styles.storageTrack}><div className={styles.storageFill} style={{ width: `${Math.min(100, (wStorageUsed / wStorageTotal) * 100)}%` }} /></div>
              <div className={styles.rowLast}><div className={styles.rowLeft}><Icon name="users" size={17} /><div className={styles.rowTitle}>Members</div></div><div className={styles.storageText}>24 people</div></div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>Appearance</div><div className={styles.cardDesc}>Choose how LexFlow looks on this device.</div></div></div>
              <div className={styles.themeSeg}>
                {(['Light', 'Dark', 'System'] as const).map((t) => (
                  <div key={t} className={styles.themeSegOption} style={{ background: appearanceTheme === t ? PRIMARY : 'transparent', color: appearanceTheme === t ? '#FFFFFF' : '#1F2937' }} onClick={() => markDirty(setAppearanceTheme)(t)}>{t}</div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'about' && (
            <div className={styles.card}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle}>About LexFlow</div><div className={styles.cardDesc}>Platform version and support resources.</div></div></div>
              <div className={styles.rowBorder}><div className={styles.rowTitle}>Version</div><div className={styles.mono}>2.4.1 (Build 2026.08.05)</div></div>
              <div className={styles.rowLast}><div style={{ display: 'flex', gap: 16 }}><a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a><a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a><a href="#" onClick={(e) => e.preventDefault()}>Help Center</a></div></div>
            </div>
          )}

          {!['general', 'profile', 'organization', 'security', 'notifications', 'ai', 'appearance', 'about', 'billing'].includes(activeSection) && (
            <div className={styles.card} style={{ alignItems: 'center', textAlign: 'center', padding: '64px 40px' }}>
              <div className={styles.comingSoonIcon}><Icon name="info" size={26} color={PRIMARY} /></div>
              <div className={styles.cardTitle}>{activeLabel}</div>
              <div className={styles.cardDesc}>This section is being crafted with the same care as the rest of LexFlow. Check back soon.</div>
            </div>
          )}

          {showGeneral && (
            <div className={styles.card} style={{ border: '1px solid #FCA5A5' }}>
              <div className={styles.cardHeadRow}><div><div className={styles.cardTitle} style={{ color: '#DC2626' }}>Danger Zone</div><div className={styles.cardDesc}>Irreversible actions — proceed with caution.</div></div></div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.footerBar}>
        <div className={styles.footerLeft}>
          {dirty && (<><span className={styles.dirtyDot} /><span>Unsaved changes</span></>)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className={styles.btnSecondary} onClick={cancelChanges}>Cancel</div>
          <div className={styles.btnPrimary} onClick={saveChanges}>Save Changes</div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
