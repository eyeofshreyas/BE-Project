/** Admin console "Clients" tab: read-only table of the firm's clients (`listClients()`). */
import { useEffect, useState } from 'react'
import { C } from '../../../components/theme'
import { listClients } from '../../../api/client'
import type { ClientSummary } from '../../../types/api'
import styles from '../../../components/AppShell.module.css'

const CLIENT_COLUMNS = ['Name', 'Email', 'Phone', 'Active Cases', 'Status', 'Pending Amount']

function moneyRound(n: number) {
  return `₹${Math.round(n).toLocaleString()}`
}

export default function ClientsView() {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Clients</div>
        <div className={styles.pageSubtitle}>Every client with a case in your firm.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div className={styles.cardTitle}>All Clients</div>
        </div>
        {loading && <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>Loading clients…</div>}
        {error && <div style={{ padding: '24px 4px', color: C.danger, fontSize: 13.5 }}>{error}</div>}
        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>{CLIENT_COLUMNS.map((col) => <th key={col} className={styles.th}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className={styles.tr}>
                    <td className={styles.td} style={{ fontWeight: 600, color: '#1A1A17' }}>{c.full_name}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{c.email}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{c.phone || '—'}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{c.active_cases}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{c.status}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{moneyRound(c.pending_amount)}</td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr><td className={styles.td} colSpan={CLIENT_COLUMNS.length} style={{ color: C.muted, textAlign: 'center', padding: '24px 4px' }}>No clients yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
