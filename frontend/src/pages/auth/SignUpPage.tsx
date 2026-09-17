/** Signup form at `/signup`. Does not auto-login -- on success it redirects to `/login`, not into the app.
 * Preselects its role toggle from `location.state.role` when arriving from `RoleSelectionPage`. */
import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import logo from '../../assets/logo.svg'
import { signup } from '../../api/client'
import styles from './SignUpPage.module.css'
import { Icon } from '../../components/icons'

const PRIMARY = '#23306B'
const BORDER = '#CFC6B0'
const TEXT = '#1A1A17'
const MUTED = '#6E6759'
const BG = '#F6F2E9'

const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: MUTED, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const LockIcon = () => <svg {...iconProps}><rect x={4} y={11} width={16} height={9} rx={2} /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
const ClockIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={9} /><path d="M12 7v5l4 2" /></svg>
const LanguagesIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={9} /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></svg>
const MapPinIcon = () => <svg {...iconProps}><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z" /><circle cx={12} cy={9.5} r={2.3} /></svg>
const AlertIcon = () => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#B3282D" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={9} /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>
const ArrowIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#FCFAF4" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
const CheckIcon = () => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FCFAF4" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
const EyeIcon = ({ off }: { off: boolean }) => off ? (
  <svg {...iconProps}><path d="M2 12s3.5-7 10-7c1.8 0 3.4.5 4.7 1.2M22 12s-3.5 7-10 7c-1.8 0-3.4-.5-4.7-1.2" /><path d="M3 3l18 18" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
) : (
  <svg {...iconProps}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx={12} cy={12} r={3} /></svg>
)

const PRACTICE_OPTIONS = ['Corporate Law', 'Family Law', 'Criminal Law', 'Property / Real Estate', 'Tax Law', 'Litigation', 'Other']
const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Tamil', 'Bengali', 'Marathi', 'Other']

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function passwordScore(pw: string) {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

const STRENGTH_META = [
  { label: '', color: BORDER },
  { label: 'Weak', color: '#B3282D' },
  { label: 'Fair', color: '#8A6A2F' },
  { label: 'Good', color: '#CFC6B0', textColor: '#1A2551' },
  { label: 'Strong', color: '#4A6B4E' },
]

type FocusName = 'fullName' | 'phone' | 'email' | 'password' | 'confirm' | 'bar' | 'practice' | 'years' | 'language' | 'address' | 'orgName' | null

/** Renders the role-toggled signup form (extra fields for lawyer vs client); validates locally then calls `handleSubmit` -> `signup()`. */
export default function SignUpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialRole = (location.state as { role?: 'lawyer' | 'client' | 'admin' } | null)?.role
  const [role, setRole] = useState<'lawyer' | 'client' | 'admin'>(initialRole ?? 'lawyer')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [barNumber, setBarNumber] = useState('')
  const [practiceArea, setPracticeArea] = useState('Corporate Law')
  const [yearsExp, setYearsExp] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('English')
  const [address, setAddress] = useState('')
  const [orgName, setOrgName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [focused, setFocused] = useState<FocusName>(null)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const isLawyer = role === 'lawyer'
  const isAdmin = role === 'admin'
  const score = passwordScore(password)
  const meta = STRENGTH_META[score] || STRENGTH_META[0]
  const canSubmit = agreeTerms && agreePrivacy

  const wrapStyle = (name: FocusName): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 9, background: BG,
    border: `1.5px solid ${focused === name ? PRIMARY : BORDER}`, borderRadius: 3, padding: '11px 13px',
    width: '100%', minWidth: 0, boxSizing: 'border-box', transition: 'border-color .15s', position: 'relative',
  })
  const mkFocus = (name: FocusName) => () => setFocused(name)

  /** Validates all fields (role-dependent), then calls `signup()` and redirects to `/login` on success. Bound to the form's submit, so Enter in any field gets here too. */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Enter your full name.'); return }
    if (!isValidEmail(email)) { setError('Enter a valid email address.'); return }
    if (!phone.trim()) { setError('Enter your phone number.'); return }
    if (passwordScore(password) < 2) { setError('Choose a stronger password.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (isLawyer && !barNumber.trim()) { setError('Enter your Bar Council registration number.'); return }
    if (role === 'client' && !address.trim()) { setError('Enter your address.'); return }
    if (isAdmin && !orgName.trim()) { setError('Enter your law firm\'s name.'); return }
    if (!canSubmit) { setError('Please accept the Terms & Conditions and Privacy Policy.'); return }
    setLoading(true)
    setError('')
    try {
      await signup({
        email,
        password,
        full_name: fullName,
        phone,
        role,
        ...(isLawyer
          ? { bar_council_number: barNumber, specialization: practiceArea, experience_years: Number(yearsExp) || undefined }
          : isAdmin
            ? { org_name: orgName }
            : { address, preferred_language: preferredLanguage }),
      })
      setToast('Account created — redirecting to sign in…')
      setTimeout(() => navigate('/login'), 1400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.')
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.brandRow}>
          <img src={logo} alt="LexFlow" className={styles.logo} />
          <div className={styles.brandName}>LexFlow</div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.title}>Create your account</div>
            <div className={styles.subtitle}>Join LexFlow to manage cases with AI-powered intelligence</div>
          </div>

          {/* noValidate: handleSubmit checks every field and reports through the styled
              error row -- the browser's own bubbles would fire first and say it twice. */}
          <form className={styles.fields} onSubmit={handleSubmit} noValidate>
            <div>
              <div className={styles.label} id="signup-role-label">I am a</div>
              <div className={styles.roleToggle} role="group" aria-labelledby="signup-role-label">
                <button type="button" aria-pressed={role === 'lawyer'} className={styles.roleOption} style={{ background: role === 'lawyer' ? '#FCFAF4' : 'transparent', color: role === 'lawyer' ? TEXT : MUTED, boxShadow: role === 'lawyer' ? '0 1px 2px rgba(35, 48, 107,.08)' : 'none' }} onClick={() => setRole('lawyer')}>
                  <Icon name="briefcase" size={15} /><span>Lawyer</span>
                </button>
                <button type="button" aria-pressed={role === 'client'} className={styles.roleOption} style={{ background: role === 'client' ? '#FCFAF4' : 'transparent', color: role === 'client' ? TEXT : MUTED, boxShadow: role === 'client' ? '0 1px 2px rgba(35, 48, 107,.08)' : 'none' }} onClick={() => setRole('client')}>
                  <Icon name="users" size={15} /><span>Client</span>
                </button>
                <button type="button" aria-pressed={isAdmin} className={styles.roleOption} style={{ background: isAdmin ? '#FCFAF4' : 'transparent', color: isAdmin ? TEXT : MUTED, boxShadow: isAdmin ? '0 1px 2px rgba(35, 48, 107,.08)' : 'none' }} onClick={() => setRole('admin')}>
                  <Icon name="building" size={15} /><span>Law Firm</span>
                </button>
              </div>
            </div>

            <div className={styles.row2}>
              <div>
                <label className={styles.label} htmlFor="signup-name">Full Name</label>
                <div style={wrapStyle('fullName')}><Icon name="user" size={16} color={MUTED} /><input id="signup-name" name="name" autoComplete="name" placeholder="Adv. Meera Kulkarni" value={fullName} onChange={(e) => setFullName(e.target.value)} onFocus={mkFocus('fullName')} onBlur={mkFocus(null)} className={styles.input} /></div>
              </div>
              <div>
                <label className={styles.label} htmlFor="signup-phone">Phone Number</label>
                <div style={wrapStyle('phone')}><Icon name="phone" size={16} color={MUTED} /><input id="signup-phone" name="tel" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} onFocus={mkFocus('phone')} onBlur={mkFocus(null)} className={styles.input} /></div>
              </div>
            </div>

            <div>
              <label className={styles.label} htmlFor="signup-email">Email Address</label>
              <div style={wrapStyle('email')}><Icon name="mail" size={16} color={MUTED} /><input id="signup-email" name="email" type="email" autoComplete="email" placeholder="you@lawfirm.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} onFocus={mkFocus('email')} onBlur={mkFocus(null)} className={styles.input} /></div>
            </div>

            <div className={styles.row2}>
              <div>
                <label className={styles.label} htmlFor="signup-password">Password</label>
                <div style={wrapStyle('password')}>
                  <LockIcon />
                  <input id="signup-password" name="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Create a password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} onFocus={mkFocus('password')} onBlur={mkFocus(null)} className={styles.input} />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}><EyeIcon off={showPassword} /></button>
                </div>
              </div>
              <div>
                <label className={styles.label} htmlFor="signup-confirm">Confirm Password</label>
                <div style={wrapStyle('confirm')}>
                  <LockIcon />
                  <input id="signup-confirm" name="confirm-password" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" placeholder="Re-enter password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError('') }} onFocus={mkFocus('confirm')} onBlur={mkFocus(null)} className={styles.input} />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowConfirm((s) => !s)} aria-label={showConfirm ? 'Hide password' : 'Show password'}><EyeIcon off={showConfirm} /></button>
                </div>
              </div>
            </div>

            {password.length > 0 && (
              <div style={{ marginTop: -8 }}>
                <div className={styles.strengthBars}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={styles.strengthBar} style={{ background: i < score ? meta.color : '#E6E0CE' }} />
                  ))}
                </div>
                <div className={styles.strengthLabel} style={{ color: meta.textColor || meta.color }}>{meta.label}</div>
              </div>
            )}
            {confirmPassword.length > 0 && confirmPassword !== password && (
              <div className={styles.errorRow} style={{ marginTop: -8 }}><AlertIcon />Passwords do not match.</div>
            )}

            {isLawyer ? (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Lawyer Details</div>
                <div>
                  <label className={styles.label} htmlFor="signup-bar">Bar Council Registration Number</label>
                  <div style={wrapStyle('bar')}><Icon name="shield" size={16} color={MUTED} /><input id="signup-bar" placeholder="e.g. D/1234/2015" value={barNumber} onChange={(e) => setBarNumber(e.target.value)} onFocus={mkFocus('bar')} onBlur={mkFocus(null)} className={styles.input} /></div>
                </div>
                <div className={styles.row2}>
                  <div>
                    <label className={styles.label} htmlFor="signup-practice">Practice Area</label>
                    <div style={wrapStyle('practice')}>
                      <Icon name="scale" size={16} color={MUTED} />
                      <select id="signup-practice" value={practiceArea} onChange={(e) => setPracticeArea(e.target.value)} className={styles.select}>
                        {PRACTICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <Icon name="chevron-down" size={14} color={MUTED} />
                    </div>
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="signup-years">Years of Experience</label>
                    <div style={wrapStyle('years')}><ClockIcon /><input id="signup-years" type="number" min={0} placeholder="5" value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} onFocus={mkFocus('years')} onBlur={mkFocus(null)} className={styles.input} /></div>
                  </div>
                </div>
              </div>
            ) : isAdmin ? (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Law Firm Details</div>
                <div>
                  <label className={styles.label} htmlFor="signup-org">Law Firm Name</label>
                  <div style={wrapStyle('orgName')}><Icon name="building" size={16} color={MUTED} /><input id="signup-org" name="organization" autoComplete="organization" placeholder="e.g. Kulkarni & Associates" value={orgName} onChange={(e) => setOrgName(e.target.value)} onFocus={mkFocus('orgName')} onBlur={mkFocus(null)} className={styles.input} /></div>
                </div>
              </div>
            ) : (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Client Details</div>
                <div>
                  <label className={styles.label} htmlFor="signup-language">Preferred Language</label>
                  <div style={wrapStyle('language')}>
                    <LanguagesIcon />
                    <select id="signup-language" value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)} className={styles.select}>
                      {LANGUAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <Icon name="chevron-down" size={14} color={MUTED} />
                  </div>
                </div>
                <div>
                  <label className={styles.label} htmlFor="signup-address">Address</label>
                  <div style={wrapStyle('address')}><MapPinIcon /><input id="signup-address" name="street-address" autoComplete="street-address" placeholder="House no., street, city, state" value={address} onChange={(e) => setAddress(e.target.value)} onFocus={mkFocus('address')} onBlur={mkFocus(null)} className={styles.input} /></div>
                </div>
              </div>
            )}

            {/* Real checkboxes behind the squares: consent to terms is exactly the control
                a keyboard or screen-reader user must be able to operate and have read back. */}
            <div className={styles.agreements}>
              <label className={styles.agreeRow}>
                <input type="checkbox" className={styles.checkboxInput} checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
                <div className={styles.checkbox} style={{ background: agreeTerms ? PRIMARY : 'transparent', border: agreeTerms ? 'none' : `1.5px solid ${BORDER}` }}>{agreeTerms && <CheckIcon />}</div>
                <div className={styles.agreeLabel}>I agree to the Terms &amp; Conditions</div>
              </label>
              <label className={styles.agreeRow}>
                <input type="checkbox" className={styles.checkboxInput} checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
                <div className={styles.checkbox} style={{ background: agreePrivacy ? PRIMARY : 'transparent', border: agreePrivacy ? 'none' : `1.5px solid ${BORDER}` }}>{agreePrivacy && <CheckIcon />}</div>
                <div className={styles.agreeLabel}>I agree to the Privacy Policy</div>
              </label>
            </div>

            {error && <div className={styles.errorRow} role="alert"><AlertIcon />{error}</div>}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : (<><span>Create Account</span><ArrowIcon /></>)}
            </button>
          </form>
        </div>

        <div className={styles.footerLine}>Already have an account? <Link to="/login">Sign In</Link></div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
