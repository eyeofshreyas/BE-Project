import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logoWhite from '../../assets/logo-white.svg'
import { login, forgotPassword } from '../../api/client'
import styles from './LoginPage.module.css'

const PRIMARY = '#B08D3E'
const BORDER = '#E7DCC6'
const MUTED = '#8C7C5E'

function MailIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x={3} y={5} width={18} height={14} rx={2} />
      <path d="M3 6l9 7 9-7" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x={4} y={11} width={16} height={9} rx={2} />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7c1.8 0 3.4.5 4.7 1.2M22 12s-3.5 7-10 7c-1.8 0-3.4-.5-4.7-1.2" />
      <path d="M3 3l18 18" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  ) : (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#EF5350" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={9} />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={9} />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 15l6-6" />
      <path d="M11 6l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M13 18l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
    </svg>
  )
}

function LanguagesIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={9} />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  )
}

const FEATURES = [
  { label: 'AI document summaries in seconds', icon: <SparklesIcon /> },
  { label: 'Semantic search across your case library', icon: <LinkIcon /> },
  { label: 'Multilingual client-ready translations', icon: <LanguagesIcon /> },
]

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [focused, setFocused] = useState<'email' | 'password' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const wrapStyle = (name: 'email' | 'password'): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, background: '#FFFFFF',
    border: `1.5px solid ${focused === name ? PRIMARY : BORDER}`, borderRadius: 12, padding: '13px 15px',
    transition: 'border-color .15s, box-shadow .15s',
    boxShadow: focused === name ? '0 0 0 3px rgba(176,141,62,.14)' : 'none',
  })

  async function handleForgotPassword() {
    if (!email || !isValidEmail(email)) { setError('Enter your email above first, then click "Forgot password?".'); return }
    setError('')
    try {
      const result = await forgotPassword(email)
      setToast(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.')
    }
  }

  async function handleSubmit() {
    if (!email || !isValidEmail(email)) { setError('Enter a valid email address.'); return }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    setError('')
    try {
      const result = await login(email, password)
      localStorage.setItem('lexflow_token', result.access_token)
      if (result.profile) localStorage.setItem('lexflow_profile', JSON.stringify(result.profile))
      setToast('Signed in — redirecting to your dashboard…')
      const dest = result.profile?.role_id === 1 ? '/admin' : '/dashboard'
      setTimeout(() => navigate(dest), 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.side}>
        <div className={styles.blobTop} />
        <div className={styles.blobBottom} />

        <div className={styles.sideTop}>
          <div className={styles.brandRow}>
            <img src={logoWhite} alt="LexFlow" className={styles.logo} />
            <div className={styles.brandName}>LexFlow</div>
          </div>
          <div className={styles.sideHeadline}>AI-assisted legal workflow, built for how firms actually work.</div>
          <div className={styles.sideBody}>Cases, clients, documents, and hearings — with multilingual AI summaries and semantic case search built in.</div>
        </div>

        <div className={styles.sideBottom}>
          {FEATURES.map((f) => (
            <div key={f.label} className={styles.featureRow}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <div className={styles.featureLabel}>{f.label}</div>
            </div>
          ))}
          <div className={styles.divider} />
          <div className={styles.trustedLine}>Trusted by 200+ chambers and legal teams</div>
        </div>
      </div>

      <div className={styles.formSide}>
        <div className={styles.formCard}>
          <div className={styles.formHead}>
            <div className={styles.welcome}>Welcome back</div>
            <div className={styles.welcomeSub}>Log in to your LexFlow account to pick up where you left off.</div>
          </div>

          <div className={styles.fields}>
            <div>
              <div className={styles.label}>Email address</div>
              <div style={wrapStyle('email')}>
                <MailIcon />
                <input
                  type="email"
                  placeholder="you@lawfirm.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError('') }}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  className={styles.input}
                />
              </div>
            </div>

            <div>
              <div className={styles.labelRow}>
                <div className={styles.label}>Password</div>
                <a href="#" onClick={(e) => { e.preventDefault(); handleForgotPassword() }} className={styles.forgotLink}>Forgot password?</a>
              </div>
              <div style={wrapStyle('password')}>
                <LockIcon />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  className={styles.input}
                />
                <span className={styles.eyeBtn} onClick={() => setShowPassword((s) => !s)}>
                  <EyeIcon off={showPassword} />
                </span>
              </div>
              {error && (
                <div className={styles.errorRow}><AlertIcon />{error}</div>
              )}
            </div>

            <div className={styles.rememberRow} onClick={() => setRemember((r) => !r)}>
              <div className={styles.checkbox} style={{ background: remember ? PRIMARY : '#FFFFFF', border: remember ? 'none' : `1.5px solid ${BORDER}` }}>
                {remember && (
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <div className={styles.rememberLabel}>Remember me for 30 days</div>
            </div>

            <div className={styles.submitBtn} onClick={handleSubmit}>
              {loading ? <span className={styles.spinner} /> : (<><span>Log In</span><ArrowIcon /></>)}
            </div>
          </div>

          <div className={styles.orRow}>
            <div className={styles.orLine} />
            <div className={styles.orLabel}>OR</div>
            <div className={styles.orLine} />
          </div>

          <div className={styles.ssoBtn}>
            <GoogleIcon /><span>Continue with Google Workspace</span>
          </div>

          <div className={styles.footerLine}>
            Don't have an account? <Link to="/role-selection">Choose your role</Link>
          </div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
