/** Static Privacy Policy at `/privacy`, linked from SignUpPage's required consent checkbox.
 * This is LexFlow's DPDP Act 2023 notice: what's collected, why, how long it's kept, and
 * how a data principal (client/lawyer/admin) can exercise their rights or raise a grievance. */
import { Link } from 'react-router-dom'
import logo from '../../assets/logo.svg'

const PRIMARY = '#23306B'
const TEXT = '#1A1A17'
const MUTED = '#6E6759'
const BG = '#F6F2E9'

const SECTION_STYLE = { marginTop: 28 }
const H2_STYLE = { color: PRIMARY, fontSize: 18, marginBottom: 8 }
const P_STYLE = { color: TEXT, lineHeight: 1.6, margin: '0 0 10px' }

export default function PrivacyPolicyPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '40px 20px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', background: '#FCFAF4', borderRadius: 6, padding: '36px 40px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24, textDecoration: 'none' }}>
          <img src={logo} alt="LexFlow" style={{ height: 28 }} />
          <span style={{ color: PRIMARY, fontWeight: 600 }}>LexFlow</span>
        </Link>

        <h1 style={{ color: PRIMARY, marginBottom: 4 }}>Privacy Policy</h1>
        <p style={{ color: MUTED, fontSize: 13, marginBottom: 0 }}>
          Notice under the Digital Personal Data Protection Act, 2023 (DPDP Act).
        </p>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>What we collect</h2>
          <p style={P_STYLE}>
            Account details (name, email, phone, password), role-specific profile information
            (Bar Council number for lawyers, address and preferred language for clients, firm
            name for admins), and the case, document, billing, and message data you or your
            firm enter into LexFlow in the course of legal representation.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>Why we collect it</h2>
          <p style={P_STYLE}>
            Solely to provide the case management, billing, document, and communication
            features of LexFlow to the law firm you are a client of or work for. We do not
            sell personal data or use it for purposes you haven't been told about.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>How long we keep it</h2>
          <p style={P_STYLE}>
            Active account and case data is kept for as long as your account or matter is
            active. Closed case files are retained afterward to meet legal record-keeping
            obligations (see your firm's retention policy); account and other personal data is
            deleted on request once there is no such obligation to retain it.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>Your rights</h2>
          <p style={P_STYLE}>
            You can ask your firm's admin for a copy of your data, a correction, or deletion of
            your account (which cascades to everything tied to it) at any time, subject to the
            retention obligation above. You can also withdraw consent for future processing by
            closing your account.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>Grievance Officer</h2>
          <p style={P_STYLE}>
            To raise a complaint about how your personal data is handled, contact our
            Grievance Officer:
            <br />
            [Grievance Officer name] — [grievance-officer@lexflow.example]
          </p>
        </div>

        <div style={{ marginTop: 32 }}>
          <Link to="/signup" style={{ color: PRIMARY, fontSize: 13 }}>&larr; Back to sign up</Link>
        </div>
      </div>
    </div>
  )
}
