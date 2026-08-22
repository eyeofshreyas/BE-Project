import { Icon } from '../icons'
import { C, pillStyle } from '../theme'
import styles from '../adminShared.module.css'

const CASE_COLUMNS = ['Case ID', 'Client', 'Assigned Lawyer', 'Court', 'Status', 'Next Hearing', 'Priority', 'Actions']

const STATUS_COLORS: Record<string, string> = { Active: C.success, Pending: C.warning, Closed: '#93826d', 'On Hold': C.danger }
const PRIORITY_COLORS: Record<string, string> = { High: C.danger, Medium: C.warning, Low: C.success }

const CASES = [
  { id: 'CASE-2041', client: 'Aditi Rao', lawyer: 'Adv. Kavita Menon', court: 'Bombay High Court', status: 'Active', hearing: '12 Aug 2026', priority: 'High' },
  { id: 'CASE-2038', client: 'Ramesh Iyer', lawyer: 'Adv. Arjun Nair', court: 'Delhi District Court', status: 'Pending', hearing: '18 Aug 2026', priority: 'Medium' },
  { id: 'CASE-2035', client: 'Verma Textiles Pvt Ltd', lawyer: 'Adv. Priya Deshmukh', court: 'NCLT Mumbai', status: 'Active', hearing: '09 Aug 2026', priority: 'High' },
  { id: 'CASE-2029', client: 'Sunita Kapoor', lawyer: 'Adv. Rohan Bhatt', court: 'Chennai District Court', status: 'Closed', hearing: '—', priority: 'Low' },
  { id: 'CASE-2022', client: 'Khan Enterprises', lawyer: 'Adv. Meera Kulkarni', court: 'Karnataka High Court', status: 'On Hold', hearing: '25 Aug 2026', priority: 'Medium' },
]

export default function CasesView() {
  return (
    <>
      <div>
        <div className={styles.pageTitle}>Cases</div>
        <div className={styles.pageSubtitle}>Every matter on the platform, with assigned counsel, court and next hearing.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div className={styles.cardTitle}>All Cases</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.primary, cursor: 'pointer' }}>Export list</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>{CASE_COLUMNS.map((col) => <th key={col} className={styles.th}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {CASES.map((row) => (
                <tr key={row.id} className={styles.tr}>
                  <td className={styles.td} style={{ fontWeight: 600, color: '#2A2118' }}>{row.id}</td>
                  <td className={styles.td} style={{ color: '#3D3126' }}>{row.client}</td>
                  <td className={styles.td} style={{ color: '#3D3126' }}>{row.lawyer}</td>
                  <td className={styles.td} style={{ color: '#8C7C5E' }}>{row.court}</td>
                  <td className={styles.td}><span className={styles.pill} style={pillStyle(STATUS_COLORS[row.status])}>{row.status}</span></td>
                  <td className={styles.td} style={{ color: '#3D3126' }}>{row.hearing}</td>
                  <td className={styles.td}><span className={styles.pill} style={pillStyle(PRIORITY_COLORS[row.priority])}>{row.priority}</span></td>
                  <td className={styles.td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <span className={styles.actionBtn} title="View"><Icon name="eye" size={15} color="#6A5C42" /></span>
                      <span className={styles.actionBtn} title="Assign Lawyer"><Icon name="user-plus" size={15} color="#6A5C42" /></span>
                      <span className={styles.actionBtn} title="View Documents"><Icon name="file-text" size={15} color="#6A5C42" /></span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
