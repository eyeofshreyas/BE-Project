/** Admin console "Reports" tab: static report-library cards and admin shortcut tiles. No API calls; buttons/tiles are non-functional placeholders. */
import { Icon, type IconName } from '../../../components/icons'
import { C } from '../../../components/theme'
import styles from '../../../components/AppShell.module.css'

const REPORTS: { label: string; desc: string; icon: IconName }[] = [
  { label: 'Case Reports', desc: 'Filing trends and case outcomes', icon: 'scale' },
  { label: 'Revenue Reports', desc: 'Monthly billing and collections', icon: 'banknote' },
  { label: 'Lawyer Performance', desc: 'Caseload and resolution speed', icon: 'briefcase' },
  { label: 'Client Statistics', desc: 'Growth and engagement metrics', icon: 'users' },
  { label: 'AI Usage Report', desc: 'Summaries, searches, translations', icon: 'sparkles' },
]

const SHORTCUTS: { label: string; icon: IconName }[] = [
  { label: 'Manage Users', icon: 'users' }, { label: 'Manage Lawyers', icon: 'briefcase' }, { label: 'Manage Clients', icon: 'user' },
  { label: 'Manage Cases', icon: 'scale' }, { label: 'View Analytics', icon: 'pie-chart' }, { label: 'System Settings', icon: 'settings' },
  { label: 'Backup Database', icon: 'database' }, { label: 'Send Notifications', icon: 'bell' },
]

/** Renders the static `REPORTS` card grid and `SHORTCUTS` tile grid; no props, no data fetching. */
export default function ReportsView() {
  return (
    <>
      <div>
        <div className={styles.pageTitle}>Reports</div>
        <div className={styles.pageSubtitle}>Generate and export platform reports, or jump straight to an admin task.</div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div className={styles.sectionTitle}>Report Library</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className={styles.chipBase} style={{ color: '#FCFAF4', background: C.primary, padding: '9px 14px', fontSize: 12.5 }}><Icon name="file-text" size={15} color="#FCFAF4" /><span>Generate Report</span></div>
            <div className={styles.chipBase} style={{ color: '#33302A', background: '#FCFAF4', border: `1px solid ${C.border}`, padding: '9px 14px', fontSize: 12.5 }}><Icon name="download" size={15} color={C.primaryDark} /><span>Export PDF</span></div>
            <div className={styles.chipBase} style={{ color: '#33302A', background: '#FCFAF4', border: `1px solid ${C.border}`, padding: '9px 14px', fontSize: 12.5 }}><Icon name="download" size={15} color={C.primaryDark} /><span>Export Excel</span></div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          {REPORTS.map((r) => (
            <div key={r.label} style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 18, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} size={18} color={C.primaryDark} /></div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1A1A17' }}>{r.label}</div>
              <div style={{ fontSize: 11.5, color: '#6E6759', lineHeight: 1.4 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>Admin Shortcuts</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          {SHORTCUTS.map((q) => (
            <div key={q.label} style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
              <div style={{ width: 40, height: 40, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={q.icon} size={19} color={C.primaryDark} /></div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17' }}>{q.label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
