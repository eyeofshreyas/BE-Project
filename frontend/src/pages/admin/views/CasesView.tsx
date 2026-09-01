import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../components/icons'
import { C, pillStyle } from '../../../components/theme'
import { listCases } from '../../../api/client'
import type { CaseSummary } from '../../../types/api'
import styles from '../../../components/AppShell.module.css'

const CASE_COLUMNS = ['Case ID', 'Client', 'Assigned Lawyer', 'Court', 'Status', 'Next Hearing', 'Priority', 'Actions']

const STATUS_COLORS: Record<string, string> = {
  Active: C.success, Pending: C.warning, Closed: '#93826d', 'On Hold': C.danger,
  Open: C.success, 'In Progress': C.warning, Resolved: '#93826d',
}
const PRIORITY_COLORS: Record<string, string> = { High: C.danger, Medium: C.warning, Low: C.success }

export default function CasesView() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listCases()
      .then(setCases)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load cases.'))
      .finally(() => setLoading(false))
  }, [])

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
        {loading && <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>Loading cases…</div>}
        {error && <div style={{ padding: '24px 4px', color: C.danger, fontSize: 13.5 }}>{error}</div>}
        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>{CASE_COLUMNS.map((col) => <th key={col} className={styles.th}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {cases.map((row) => (
                  <tr key={row.id} className={styles.tr}>
                    <td className={styles.td} style={{ fontWeight: 600, color: '#2A2118' }}>{row.id}</td>
                    <td className={styles.td} style={{ color: '#3D3126' }}>{row.client ?? '—'}</td>
                    <td className={styles.td} style={{ color: '#3D3126' }}>{row.lawyer ?? '—'}</td>
                    <td className={styles.td} style={{ color: '#8C7C5E' }}>{row.court ?? '—'}</td>
                    <td className={styles.td}><span className={styles.pill} style={pillStyle(STATUS_COLORS[row.status] ?? C.muted)}>{row.status}</span></td>
                    <td className={styles.td} style={{ color: '#3D3126' }}>{row.hearing ?? '—'}</td>
                    <td className={styles.td}><span className={styles.pill} style={pillStyle(PRIORITY_COLORS[row.priority] ?? C.muted)}>{row.priority}</span></td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span className={styles.actionBtn} title="View" onClick={() => navigate(`/cases/${row.case_id}`)}><Icon name="eye" size={15} color="#6A5C42" /></span>
                        <span className={styles.actionBtn} title="Assign Lawyer"><Icon name="user-plus" size={15} color="#6A5C42" /></span>
                        <span className={styles.actionBtn} title="View Documents"><Icon name="file-text" size={15} color="#6A5C42" /></span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
