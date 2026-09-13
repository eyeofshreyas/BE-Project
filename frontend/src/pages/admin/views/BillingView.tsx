/** Admin console "Billing" tab: read-only table of every invoice across the firm (`listInvoices()`). */
import { useEffect, useState } from 'react'
import { C, pillStyle } from '../../../components/theme'
import { listInvoices } from '../../../api/client'
import type { InvoiceSummary } from '../../../types/api'
import { formatDate } from '../../../utils/date'
import styles from '../../../components/AppShell.module.css'

const INVOICE_COLUMNS = ['Invoice #', 'Client', 'Case', 'Amount', 'Due Date', 'Status']
const STATUS_COLORS: Record<string, string> = {
  Paid: C.success,
  Pending: C.warning,
  'Partially Paid': C.warning,
  Overdue: C.danger,
}

function money(n: number) {
  return `₹${Math.round(n).toLocaleString()}`
}

/** Backend `payment_status`, upgraded to "Overdue" if unpaid and past `due_date` -- matches BillingPage's own display logic. */
function displayStatus(inv: InvoiceSummary): string {
  const today = new Date().toISOString().slice(0, 10)
  if (inv.payment_status !== 'Paid' && inv.due_date && inv.due_date < today) return 'Overdue'
  return inv.payment_status
}

export default function BillingView() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoices.'))
      .finally(() => setLoading(false))
  }, [])

  const outstanding = invoices.filter((i) => displayStatus(i) !== 'Paid').reduce((sum, i) => sum + i.total_amount, 0)

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Billing</div>
        <div className={styles.pageSubtitle}>Every invoice across the firm's cases{invoices.length > 0 && ` · ${money(outstanding)} outstanding`}.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div className={styles.cardTitle}>All Invoices</div>
        </div>
        {loading && <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>Loading invoices…</div>}
        {error && <div style={{ padding: '24px 4px', color: C.danger, fontSize: 13.5 }}>{error}</div>}
        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>{INVOICE_COLUMNS.map((col) => <th key={col} className={styles.th}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const status = displayStatus(inv)
                  return (
                    <tr key={inv.id} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 600, color: '#1A1A17' }}>{inv.invoice_number}</td>
                      <td className={styles.td} style={{ color: '#33302A' }}>{inv.client ?? '—'}</td>
                      <td className={styles.td} style={{ color: '#6E6759' }}>{inv.case_number ?? '—'}</td>
                      <td className={styles.td} style={{ color: '#33302A' }}>{money(inv.total_amount)}</td>
                      <td className={styles.td} style={{ color: '#33302A' }}>{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                      <td className={styles.td}><span className={styles.pill} style={pillStyle(STATUS_COLORS[status] ?? C.muted)}>{status}</span></td>
                    </tr>
                  )
                })}
                {invoices.length === 0 && (
                  <tr><td className={styles.td} colSpan={INVOICE_COLUMNS.length} style={{ color: C.muted, textAlign: 'center', padding: '24px 4px' }}>No invoices yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
