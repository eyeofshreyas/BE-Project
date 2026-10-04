/** Static Terms & Conditions at `/terms`, linked from SignUpPage's required consent
 * checkbox. DRAFT: covers the standard ground for a legal case-management SaaS, but the
 * jurisdiction/dispute-resolution section is a business decision -- flagged for review. */
import { Link } from 'react-router-dom'
import logo from '../../assets/logo.svg'

const PRIMARY = '#23306B'
const TEXT = '#1A1A17'
const MUTED = '#6E6759'
const BG = '#F6F2E9'

const SECTION_STYLE = { marginTop: 28 }
const H2_STYLE = { color: PRIMARY, fontSize: 18, marginBottom: 8 }
const P_STYLE = { color: TEXT, lineHeight: 1.6, margin: '0 0 10px' }

export default function TermsPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '40px 20px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', background: '#FCFAF4', borderRadius: 6, padding: '36px 40px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24, textDecoration: 'none' }}>
          <img src={logo} alt="LexFlow" style={{ height: 28 }} />
          <span style={{ color: PRIMARY, fontWeight: 600 }}>LexFlow</span>
        </Link>

        <h1 style={{ color: PRIMARY, marginBottom: 4 }}>Terms &amp; Conditions</h1>
        <p style={{ color: MUTED, fontSize: 13, marginBottom: 0 }}>
          Draft — pending review. Last updated [date].
        </p>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>1. Acceptance of terms</h2>
          <p style={P_STYLE}>
            By creating a LexFlow account you agree to these terms. If you're accepting them
            on behalf of a law firm (as an admin), you're confirming you have authority to
            bind that firm.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>2. The service</h2>
          <p style={P_STYLE}>
            LexFlow is case and conveyancing management software: it lets admins manage
            users, lawyers manage assigned cases (billing, hearings, documents, messaging),
            and clients track their matters, pay invoices, and message their lawyer. LexFlow
            is a software provider, not a law firm, and does not give legal advice.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>3. Accounts</h2>
          <p style={P_STYLE}>
            Accounts are created by invite (from a firm admin, for lawyers and clients) or by
            registering a firm (for admins). You're responsible for keeping your credentials
            confidential and for activity under your account. Tell us immediately if you
            suspect unauthorized access.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>4. Fees and payments</h2>
          <p style={P_STYLE}>
            Invoices raised through LexFlow are payable through our payment processor
            (Razorpay). [Platform subscription fees, billing cycle, and refund policy —
            to be added once pricing is finalized.]
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>5. Your data and ours</h2>
          <p style={P_STYLE}>
            You and your firm retain ownership of the case, document, and client data you put
            into LexFlow. We process it to provide the service, as described in our{' '}
            <Link to="/privacy">Privacy Policy</Link>. LexFlow owns the platform itself —
            the software, design, and underlying technology.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>6. Confidentiality</h2>
          <p style={P_STYLE}>
            Case data often includes privileged or confidential information. We will not
            access it except to provide support you request or where the law requires it, and
            we expect every user to handle case data with the confidentiality their
            professional obligations require.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>7. Termination</h2>
          <p style={P_STYLE}>
            You or your firm admin can close an account at any time; deletion cascades to the
            data tied to it, subject to the retention obligations described in our{' '}
            <Link to="/privacy">Privacy Policy</Link>. We may suspend or terminate accounts
            that violate these terms or misuse the service.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>8. Limitation of liability</h2>
          <p style={P_STYLE}>
            LexFlow is provided "as is." To the maximum extent permitted by law, we are not
            liable for indirect, incidental, or consequential damages arising from use of the
            service. [Liability cap amount/formula — to be set by the business.]
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>9. Governing law and disputes</h2>
          <p style={P_STYLE}>
            [NEEDS INPUT: these terms are governed by the laws of India; courts of
            [city] have exclusive jurisdiction — confirm the city, and whether disputes go
            to arbitration first or straight to those courts.]
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>10. Changes to these terms</h2>
          <p style={P_STYLE}>
            We may update these terms from time to time. Continued use of LexFlow after a
            change takes effect means you accept the updated terms.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>11. Contact</h2>
          <p style={P_STYLE}>
            Questions about these terms: [contact email].
          </p>
        </div>

        <div style={{ marginTop: 32 }}>
          <Link to="/signup" style={{ color: PRIMARY, fontSize: 13 }}>&larr; Back to sign up</Link>
        </div>
      </div>
    </div>
  )
}
