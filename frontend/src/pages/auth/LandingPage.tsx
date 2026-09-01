/** Public marketing page at `/`. Static content only, no API calls; scroll-spies its own sections to highlight the active nav link. */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../../assets/logo.svg'
import heroDashboard from '../../assets/hero-dashboard.jpg'
import heroAttorney from '../../assets/hero-attorney.jpg'
import styles from './LandingPage.module.css'
import { Icon } from '../../components/icons'

const PRIMARY = '#B08D3E'

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: PRIMARY, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const DatabaseIcon = () => <svg {...iconProps}><ellipse cx={12} cy={6} rx={8} ry={3} /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
const ClockIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={9} /><path d="M12 7v5l4 2" /></svg>
const ShieldIcon = () => <svg {...iconProps}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg>
const BuildingIcon = () => <svg {...iconProps}><rect x={4} y={3} width={16} height={18} /><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" /></svg>
const FileTextIcon = () => <svg {...iconProps}><path d="M6 3h8l4 4v14H6z" /><path d="M9 12h6" /><path d="M9 16h6" /></svg>
const TrendingUpIcon = () => <svg {...iconProps}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>
const LockIcon = () => <svg {...iconProps}><rect x={4} y={11} width={16} height={9} rx={2} /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
const UsersIcon = () => <svg {...iconProps}><circle cx={9} cy={8} r={3} /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx={17} cy={9} r={2.5} /></svg>
const ActivityIcon = () => <svg {...iconProps}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
const SparklesIcon = () => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /></svg>
const ShieldIconW = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg>
const CheckIconW = () => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>

const NAV_SECTIONS = [
  { id: 'challenges', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'why', label: 'Why LexFlow' },
  { id: 'contact', label: 'Contact' },
]

const CHALLENGES = [
  { title: 'Volume Crisis', desc: 'Managing petabytes of discovery data without losing precision.', icon: <DatabaseIcon /> },
  { title: 'Time Leaks', desc: 'Manual reviews costing thousands of billable hours annually.', icon: <ClockIcon /> },
  { title: 'Data Risks', desc: 'Securing sensitive client intelligence in a digital landscape.', icon: <ShieldIcon /> },
  { title: 'Hidden Insights', desc: 'Missing critical precedents buried in legacy archives.', icon: <Icon name="search" color={PRIMARY} /> },
  { title: 'Compliance', desc: 'Keeping pace with rapidly evolving jurisdictional regulations.', icon: <BuildingIcon /> },
]

const FEATURES = [
  { title: 'AI Summarization', desc: 'Condense thousands of pages of discovery into actionable executive briefs in minutes.', icon: <FileTextIcon /> },
  { title: 'Precedent Discovery', desc: 'Neural search that understands legal intent across 20+ years of case history.', icon: <Icon name="search" color={PRIMARY} /> },
  { title: 'Smart Contracts', desc: 'Automated clause identification and risk scoring for high-stakes negotiations.', icon: <Icon name="edit" color={PRIMARY} /> },
  { title: 'Predictive Analytics', desc: 'Data-driven outcomes for litigation strategy and settlement modeling.', icon: <TrendingUpIcon /> },
  { title: 'Zero-Trust Vault', desc: 'Military-grade encryption for the most sensitive corporate litigation data.', icon: <LockIcon /> },
  { title: 'Partner Portals', desc: 'Discreet collaboration spaces for cross-border legal teams and co-counsel.', icon: <UsersIcon /> },
  { title: 'Drafting AI', desc: "Generative legal writing that adapts to your firm's specific stylistic voice.", icon: <Icon name="edit" color={PRIMARY} /> },
  { title: 'Real-time Audits', desc: 'Continuous monitoring of legal obligations across entire document estates.', icon: <ActivityIcon /> },
]

const WHY_POINTS = [
  { title: 'Discretion by Design', desc: 'On-premise deployment options for the most rigorous security mandates.' },
  { title: 'Bespoke Knowledge Graphs', desc: "AI trained from your firm's specific history and intellectual property." },
  { title: 'Architectural Clarity', desc: 'An interface designed to reduce cognitive load during high-stakes reviews.' },
]

const ONBOARDING_STEPS = ['Sign In', 'Import Data', 'AI Indexing', 'Review Insights', 'Collaborate', 'Manage']

const FOOTER_COLS = [
  { title: 'Platform', links: ['Features', 'Security', 'Pricing'] },
  { title: 'Legal', links: ['Terms', 'Privacy', 'Discretion Agreement'] },
  { title: 'Connect', links: ['LinkedIn', 'Twitter'] },
]

/**
 * Renders the marketing nav, hero, challenges/features/why/onboarding
 * sections and footer. Uses an `IntersectionObserver` on the section refs
 * to track `activeSection` for the nav underline as the user scrolls.
 */
export default function LandingPage() {
  const [activeSection, setActiveSection] = useState('challenges')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    )
    NAV_SECTIONS.forEach(({ id }) => {
      const el = sectionRefs.current[id]
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  function scrollToSection(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.nav}>
        <div className={styles.navLeft}>
          <div className={styles.brandRow}>
            <img src={logo} alt="LexFlow" className={styles.logo} />
            <div className={styles.brandName}>LexFlow</div>
          </div>
          <div className={styles.navLinks}>
            {NAV_SECTIONS.map((n) => {
              const active = activeSection === n.id
              return (
                <a key={n.id} href={`#${n.id}`} onClick={scrollToSection(n.id)} className={styles.navLink} style={{ fontWeight: active ? 700 : 500, color: active ? '#2A2118' : '#8C7C5E' }}>
                  {n.label}
                  <span className={styles.navUnderline} style={{ transform: `scaleX(${active ? 1 : 0})` }} />
                </a>
              )
            })}
          </div>
        </div>
        <div className={styles.navRight}>
          <Link to="/login" className={styles.signInLink}>Sign In</Link>
          <Link to="/signup" className={styles.navCta}>Get Started</Link>
        </div>
      </div>

      <div className={styles.hero}>
        <div className={styles.heroFade}>
          <div className={styles.eyebrow}><SparklesIcon /> AI-Powered Legal Intelligence</div>
          <div className={styles.heroTitle}>Transform Legal Workflows with AI</div>
          <div className={styles.heroBody}>Experience the future of prestige legal practice. Automate document review, streamline case management, and extract insights with architectural precision and unrivaled security.</div>
          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.primaryBtn}>Get Started Free</Link>
            <Link to="/login" className={styles.secondaryBtn}>Sign In</Link>
          </div>
        </div>
        <div className={styles.heroImageWrap}>
          <img src={heroDashboard} alt="LexFlow case intelligence dashboard in a modern office" className={styles.heroImage} />
          <div className={styles.floatCard1}>
            <div className={styles.floatCard1Label}>Precedent AI</div>
            <div className={styles.floatBar}><div className={styles.floatBarFill} /></div>
          </div>
          <div className={styles.floatCard2}>
            <div className={styles.floatCard2Icon}><ShieldIconW /></div>
            <div>
              <div className={styles.floatCard2Title}>Document Risk</div>
              <div className={styles.floatCard2Sub}>Scoring 98/100</div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.challengesSection} id="challenges" ref={(el) => { sectionRefs.current.challenges = el }}>
        <div className={styles.sectionInner}>
          <div className={styles.kicker}>Challenges</div>
          <div className={styles.sectionTitle}>The Burden of Modern Legal Work</div>
          <div className={styles.challengesGrid}>
            {CHALLENGES.map((c) => (
              <div key={c.title} className={styles.challengeCard}>
                <div className={styles.challengeIconWrap}>{c.icon}</div>
                <div className={styles.challengeTitle}>{c.title}</div>
                <div className={styles.challengeDesc}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.featuresSection} id="features" ref={(el) => { sectionRefs.current.features = el }}>
        <div className={styles.sectionInner}>
          <div className={styles.featuresHead}>
            <div>
              <div className={styles.kicker}>Solutions</div>
              <div className={styles.sectionTitle}>Powerful Features</div>
            </div>
            <div className={styles.featuresIntro}>Engineered for specialized legal counsel who expect a digital environment as refined as a physical boardroom.</div>
          </div>
          <div className={styles.featuresGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                <div className={styles.featureIconWrap}>{f.icon}</div>
                <div className={styles.featureTitle}>{f.title}</div>
                <div className={styles.featureDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.whySection} id="why" ref={(el) => { sectionRefs.current.why = el }}>
        <div className={styles.whyInner}>
          <img src={heroAttorney} alt="Attorney reviewing LexFlow case analysis in a law library" className={styles.whyImage} />
          <div>
            <div className={styles.kicker}>Intelligent Design</div>
            <div className={styles.sectionTitle}>Built for the Future of Law</div>
            <div className={styles.whyBody}>LexFlow isn't just a tool. It's a digital extension of your intellectual rigor. We've combined deep legal expertise with cutting-edge neural architectures.</div>
            <div className={styles.whyPoints}>
              {WHY_POINTS.map((w) => (
                <div key={w.title} className={styles.whyPointRow}>
                  <div className={styles.whyCheck}><CheckIconW /></div>
                  <div>
                    <div className={styles.whyPointTitle}>{w.title}</div>
                    <div className={styles.whyPointDesc}>{w.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.onboardingSection} id="onboarding" ref={(el) => { sectionRefs.current.onboarding = el }}>
        <div className={styles.sectionInner} style={{ textAlign: 'center' }}>
          <div className={styles.kicker}>Onboarding</div>
          <div className={styles.sectionTitle}>Simplified Adoption</div>
          <div className={styles.onboardingSteps}>
            <div className={styles.onboardingLine} />
            {ONBOARDING_STEPS.map((label, i) => (
              <div key={label} className={styles.onboardingStep}>
                <div className={styles.onboardingNum}>{i + 1}</div>
                <div className={styles.onboardingLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.contactSection} id="contact" ref={(el) => { sectionRefs.current.contact = el }}>
        <div className={styles.contactBox}>
          <div className={styles.contactTitle}>Elevate Your Legal Practice Today</div>
          <div className={styles.contactBody}>Join the world's most prestigious law firms in redefining the boundaries of legal intelligence.</div>
          <div className={styles.contactActions}>
            <Link to="/signup" className={styles.primaryBtn}>Start Your Free Trial</Link>
            <div className={styles.ghostBtn}>Schedule a Demo</div>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <div className={styles.brandRow}><img src={logo} alt="LexFlow" className={styles.footerLogo} /><div className={styles.footerBrand}>LexFlow</div></div>
            <div className={styles.footerTagline}>Redefining the legal landscape through architectural precision and artificial intelligence.</div>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <div className={styles.footerColTitle}>{col.title}</div>
              <div className={styles.footerColLinks}>
                {col.links.map((l) => <a key={l} href="#" onClick={(e) => e.preventDefault()} className={styles.footerLink}>{l}</a>)}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.footerBottom}>
          <div>© 2026 LexFlow. All rights reserved.</div>
          <div>Prestige Assurance</div>
        </div>
      </div>
    </div>
  )
}
