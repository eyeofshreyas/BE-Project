import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import logo from '../../assets/logo.svg'
import styles from './SignUpPage.module.css'

const PRIMARY = '#B08D3E'
const BORDER = '#E7DCC6'
const TEXT = '#2A2118'
const MUTED = '#8C7C5E'
const BG = '#FCF9F3'

const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: MUTED, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const UserIcon = () => <svg {...iconProps}><circle cx={12} cy={8} r={4} /><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
const MailIcon = () => <svg {...iconProps}><rect x={3} y={5} width={18} height={14} rx={2} /><path d="M3 6l9 7 9-7" /></svg>
const PhoneIcon = () => <svg {...iconProps}><path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2 2C9.5 19 5 14.5 5 8a2 2 0 0 1 1-2z" /></svg>
const LockIcon = () => <svg {...iconProps}><rect x={4} y={11} width={16} height={9} rx={2} /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
const ShieldIcon = () => <svg {...iconProps}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
const ScaleIcon = () => <svg {...iconProps}><path d="M12 3v18" /><path d="M7 6h10" /><path d="M4 6l3 6a3 3 0 0 0 6 0L10 6" /><path d="M14 6l3 6a3 3 0 0 0 6 0L20 6" /></svg>
const ClockIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={9} /><path d="M12 7v5l4 2" /></svg>
const LanguagesIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={9} /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></svg>
const MapPinIcon = () => <svg {...iconProps}><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z" /><circle cx={12} cy={9.5} r={2.3} /></svg>
const ChevronIcon = () => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
const AlertIcon = () => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#EF5350" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={9} /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>
const ArrowIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
const CheckIcon = () => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
const BriefcaseIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={3} y={8} width={18} height={12} rx={2} /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
const UsersIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx={9} cy={8} r={3} /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx={17} cy={9} r={2.5} /><path d="M21 20c0-2.5-1.8-4.6-4.2-5.4" /></svg>
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
  { label: 'Weak', color: '#EF5350' },
  { label: 'Fair', color: '#FFB74D' },
  { label: 'Good', color: '#D8C79A', textColor: '#7A5A24' },
  { label: 'Strong', color: '#4CAF50' },
]

type FocusName = 'fullName' | 'phone' | 'email' | 'password' | 'confirm' | 'bar' | 'practice' | 'years' | 'language' | 'address' | null

export default function SignUpPage() {
  const [role, setRole] = useState<'lawyer' | 'client'>('lawyer')
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [focused, setFocused] = useState<FocusName>(null)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const isLawyer = role === 'lawyer'
  const score = passwordScore(password)
  const meta = STRENGTH_META[score] || STRENGTH_META[0]
  const canSubmit = agreeTerms && agreePrivacy

  const wrapStyle = (name: FocusName): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 9, background: BG,
    border: `1.5px solid ${focused === name ? PRIMARY : BORDER}`, borderRadius: 11, padding: '11px 13px',
    width: '100%', minWidth: 0, boxSizing: 'border-box', transition: 'border-color .15s', position: 'relative',
  })
  const mkFocus = (name: FocusName) => () => setFocused(name)

  function handleSubmit() {
    if (!fullName.trim()) { setError('Enter your full name.'); return }
    if (!isValidEmail(email)) { setError('Enter a valid email address.'); return }
    if (!phone.trim()) { setError('Enter your phone number.'); return }
    if (passwordScore(password) < 2) { setError('Choose a stronger password.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (isLawyer && !barNumber.trim()) { setError('Enter your Bar Council registration number.'); return }
    if (!isLawyer && !address.trim()) { setError('Enter your address.'); return }
    if (!canSubmit) { setError('Please accept the Terms & Conditions and Privacy Policy.'); return }
    setLoading(true)
    setError('')
    setTimeout(() => {
      setLoading(false)
      setToast('Account created — redirecting to your dashboard…')
      setTimeout(() => setToast(null), 2200)
    }, 900)
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

          <div className={styles.fields}>
            <div>
              <div className={styles.label}>I am a</div>
              <div className={styles.roleToggle}>
                <div className={styles.roleOption} style={{ background: isLawyer ? '#FFFFFF' : 'transparent', color: isLawyer ? TEXT : MUTED, boxShadow: isLawyer ? '0 1px 2px rgba(42,33,24,.08)' : 'none' }} onClick={() => setRole('lawyer')}>
                  <BriefcaseIcon /><span>Lawyer</span>
                </div>
                <div className={styles.roleOption} style={{ background: !isLawyer ? '#FFFFFF' : 'transparent', color: !isLawyer ? TEXT : MUTED, boxShadow: !isLawyer ? '0 1px 2px rgba(42,33,24,.08)' : 'none' }} onClick={() => setRole('client')}>
                  <UsersIcon /><span>Client</span>
                </div>
              </div>
            </div>

            <div className={styles.row2}>
              <div>
                <div className={styles.label}>Full Name</div>
                <div style={wrapStyle('fullName')}><UserIcon /><input placeholder="Adv. Meera Kulkarni" value={fullName} onChange={(e) => setFullName(e.target.value)} onFocus={mkFocus('fullName')} onBlur={mkFocus(null)} className={styles.input} /></div>
              </div>
              <div>
                <div className={styles.label}>Phone Number</div>
                <div style={wrapStyle('phone')}><PhoneIcon /><input placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} onFocus={mkFocus('phone')} onBlur={mkFocus(null)} className={styles.input} /></div>
              </div>
            </div>

            <div>
              <div className={styles.label}>Email Address</div>
              <div style={wrapStyle('email')}><MailIcon /><input type="email" placeholder="you@lawfirm.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} onFocus={mkFocus('email')} onBlur={mkFocus(null)} className={styles.input} /></div>
            </div>

            <div className={styles.row2}>
              <div>
                <div className={styles.label}>Password</div>
                <div style={wrapStyle('password')}>
                  <LockIcon />
                  <input type={showPassword ? 'text' : 'password'} placeholder="Create a password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} onFocus={mkFocus('password')} onBlur={mkFocus(null)} className={styles.input} />
                  <span className={styles.eyeBtn} onClick={() => setShowPassword((s) => !s)}><EyeIcon off={showPassword} /></span>
                </div>
              </div>
              <div>
                <div className={styles.label}>Confirm Password</div>
                <div style={wrapStyle('confirm')}>
                  <LockIcon />
                  <input type={showConfirm ? 'text' : 'password'} placeholder="Re-enter password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError('') }} onFocus={mkFocus('confirm')} onBlur={mkFocus(null)} className={styles.input} />
                  <span className={styles.eyeBtn} onClick={() => setShowConfirm((s) => !s)}><EyeIcon off={showConfirm} /></span>
                </div>
              </div>
            </div>

            {password.length > 0 && (
              <div style={{ marginTop: -8 }}>
                <div className={styles.strengthBars}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={styles.strengthBar} style={{ background: i < score ? meta.color : '#EFE4CB' }} />
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
                  <div className={styles.label}>Bar Council Registration Number</div>
                  <div style={wrapStyle('bar')}><ShieldIcon /><input placeholder="e.g. D/1234/2015" value={barNumber} onChange={(e) => setBarNumber(e.target.value)} onFocus={mkFocus('bar')} onBlur={mkFocus(null)} className={styles.input} /></div>
                </div>
                <div className={styles.row2}>
                  <div>
                    <div className={styles.label}>Practice Area</div>
                    <div style={wrapStyle('practice')}>
                      <ScaleIcon />
                      <select value={practiceArea} onChange={(e) => setPracticeArea(e.target.value)} className={styles.select}>
                        {PRACTICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <ChevronIcon />
                    </div>
                  </div>
                  <div>
                    <div className={styles.label}>Years of Experience</div>
                    <div style={wrapStyle('years')}><ClockIcon /><input type="number" min={0} placeholder="5" value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} onFocus={mkFocus('years')} onBlur={mkFocus(null)} className={styles.input} /></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Client Details</div>
                <div>
                  <div className={styles.label}>Preferred Language</div>
                  <div style={wrapStyle('language')}>
                    <LanguagesIcon />
                    <select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)} className={styles.select}>
                      {LANGUAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronIcon />
                  </div>
                </div>
                <div>
                  <div className={styles.label}>Address</div>
                  <div style={wrapStyle('address')}><MapPinIcon /><input placeholder="House no., street, city, state" value={address} onChange={(e) => setAddress(e.target.value)} onFocus={mkFocus('address')} onBlur={mkFocus(null)} className={styles.input} /></div>
                </div>
              </div>
            )}

            <div className={styles.agreements}>
              <div className={styles.agreeRow} onClick={() => setAgreeTerms((v) => !v)}>
                <div className={styles.checkbox} style={{ background: agreeTerms ? PRIMARY : 'transparent', border: agreeTerms ? 'none' : `1.5px solid ${BORDER}` }}>{agreeTerms && <CheckIcon />}</div>
                <div className={styles.agreeLabel}>I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Terms &amp; Conditions</a></div>
              </div>
              <div className={styles.agreeRow} onClick={() => setAgreePrivacy((v) => !v)}>
                <div className={styles.checkbox} style={{ background: agreePrivacy ? PRIMARY : 'transparent', border: agreePrivacy ? 'none' : `1.5px solid ${BORDER}` }}>{agreePrivacy && <CheckIcon />}</div>
                <div className={styles.agreeLabel}>I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a></div>
              </div>
            </div>

            {error && <div className={styles.errorRow}><AlertIcon />{error}</div>}

            <div className={styles.submitBtn} style={{ opacity: loading ? 0.85 : 1 }} onClick={handleSubmit}>
              {loading ? <span className={styles.spinner} /> : (<><span>Create Account</span><ArrowIcon /></>)}
            </div>
          </div>
        </div>

        <div className={styles.footerLine}>Already have an account? <Link to="/login">Sign In</Link></div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
