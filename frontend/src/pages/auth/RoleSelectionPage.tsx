/** Role picker at `/role-selection` shown before signup. Purely cosmetic: the chosen role is not passed on to `SignUpPage` (which asks again). */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logo from '../../assets/logo.svg'
import styles from './RoleSelectionPage.module.css'

const PRIMARY = '#B08D3E'
const PRIMARY_DARK = '#7A5A24'
const BORDER = '#E7DCC6'

function BriefcaseIcon({ color }: { color: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x={3} y={8} width={18} height={12} rx={2} />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function UsersIcon({ color }: { color: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={9} cy={8} r={3} />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx={17} cy={9} r={2.5} />
      <path d="M21 20c0-2.5-1.8-4.6-4.2-5.4" />
    </svg>
  )
}

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

type RoleKey = 'lawyer' | 'client' | 'admin'

const ROLES: { key: RoleKey; title: string; desc: string; icon: (c: string) => React.ReactNode; bullets: string[] }[] = [
  { key: 'lawyer', title: 'Lawyer', desc: 'Manage cases, clients, documents and billing.', icon: (c) => <BriefcaseIcon color={c} />, bullets: ['Case & client management', 'AI summaries & search', 'Invoicing & scheduling'] },
  { key: 'client', title: 'Client', desc: 'Track your cases and understand your documents.', icon: (c) => <UsersIcon color={c} />, bullets: ['Case progress tracking', 'Multilingual AI summaries', 'Invoices & hearings'] },
  { key: 'admin', title: 'Admin', desc: 'Oversee users, cases and platform health.', icon: (c) => <ShieldIcon color={c} />, bullets: ['User & lawyer management', 'Reports & analytics', 'System settings'] },
]

export default function RoleSelectionPage() {
  const [selected, setSelected] = useState<RoleKey | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const navigate = useNavigate()
  const canContinue = !!selected

  function handleContinue() {
    if (!canContinue) return
    setToast(`Continuing sign-up as ${selected!.charAt(0).toUpperCase()}${selected!.slice(1)}…`)
    setTimeout(() => {
      setToast(null)
      navigate('/signup')
    }, 900)
  }

  return (
    <div className={styles.page}>
      <div className={styles.brandRow}>
        <img src={logo} alt="LexFlow" className={styles.logo} />
        <div className={styles.brandName}>LexFlow</div>
      </div>

      <div className={styles.headline}>
        <div className={styles.title}>How will you use LexFlow?</div>
        <div className={styles.subtitle}>Choose your role to set up an account tailored to your workflow. You can request a role change later from Settings.</div>
      </div>

      <div className={styles.grid}>
        {ROLES.map((r) => {
          const active = selected === r.key
          return (
            <div
              key={r.key}
              className={styles.card}
              style={{
                border: active ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                boxShadow: active ? '0 12px 28px rgba(176,141,62,.18)' : '0 1px 2px rgba(42,33,24,.04)',
                transform: active ? 'translateY(-2px)' : 'none',
              }}
              onClick={() => setSelected(r.key)}
            >
              <div className={styles.iconWrap} style={{ background: active ? PRIMARY : '#EFE4CB' }}>
                {r.icon(active ? '#FFFFFF' : PRIMARY_DARK)}
              </div>
              <div className={styles.cardTitle}>{r.title}</div>
              <div className={styles.cardDesc}>{r.desc}</div>
              <div className={styles.bullets}>
                {r.bullets.map((b) => (
                  <div key={b} className={styles.bullet}><span className={styles.dot} />{b}</div>
                ))}
              </div>
              <div className={styles.radio} style={{ border: active ? 'none' : `2px solid ${BORDER}`, background: active ? PRIMARY : 'transparent' }}>
                {active && <CheckIcon />}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <div
          className={styles.continueBtn}
          style={{ cursor: canContinue ? 'pointer' : 'not-allowed', background: canContinue ? PRIMARY : '#E9DFD1', color: canContinue ? '#FFFFFF' : '#A38F66', boxShadow: canContinue ? '0 6px 16px rgba(176,141,62,.28)' : 'none' }}
          onClick={handleContinue}
        >
          Continue<ArrowIcon />
        </div>
        <div className={styles.loginLine}>Already have an account? <Link to="/login">Log in</Link></div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
