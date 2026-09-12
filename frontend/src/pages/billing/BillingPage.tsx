/** `/billing` route: role-dispatches to a lawyer-facing management view (`StaffBillingView`) or a read-only client view (`ClientInvoicesView`). */
import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { listInvoices, sendInvoiceReminder, listInvoicePayments, createRazorpayOrder, verifyRazorpayPayment } from '../../api/client'
import type { InvoiceSummary, PaymentSummary, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const LAWYER = 2
const CLIENT = 3

// Razorpay Checkout.js (loaded via a <script> tag in index.html) has no official TS types --
// this is just the small slice of its constructor options/instance this page actually uses.
type RazorpayCheckoutOptions = {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description?: string
  prefill?: { name?: string; email?: string; contact?: string }
  theme?: { color?: string }
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void
  modal?: { ondismiss?: () => void }
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void }
  }
}

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const MUTED = '#6E6759'
const PRIMARY = '#23306B'
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Paid: ['#4A6B4E', '#E4EDE5'],
  'Partially Paid': ['#8A6A2F', '#F3EBD9'],
  Pending: ['#8A6A2F', '#F3EBD9'],
  Overdue: ['#B3282D', '#F7E4E5'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#575145', '#F0ECDF']
const TIME_FILTERS = ['All Time', 'This Month', 'This Quarter', 'This Year'] as const

function money(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function moneyRound(n: number) {
  return `₹${Math.round(n).toLocaleString()}`
}

/** Derives the badge status shown for an invoice: backend `payment_status`, upgraded to "Overdue" if unpaid and past `due_date`. */
function displayStatus(inv: InvoiceSummary): string {
  const today = new Date().toISOString().slice(0, 10)
  if (inv.payment_status !== 'Paid' && inv.due_date && inv.due_date < today) return 'Overdue'
  return inv.payment_status
}

function withinTimeFilter(issueDate: string, filter: (typeof TIME_FILTERS)[number]): boolean {
  if (filter === 'All Time') return true
  const now = new Date()
  const d = new Date(issueDate)
  if (filter === 'This Month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (filter === 'This Quarter') return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3)
  return d.getFullYear() === now.getFullYear()
}

/** Reads the session profile and renders `ClientInvoicesView` for clients, `StaffBillingView` (lawyer/admin) otherwise. */
export default function BillingPage() {
  const profile = loadProfile()
  if (profile?.role_id === CLIENT) return <ClientInvoicesView />
  return <StaffBillingView />
}

/**
 * Lawyer/admin invoice management: loads invoices via `listInvoices()`, with
 * search/status/time filtering, invoice generation via the dedicated
 * `/billing/invoices/generate` page, payment recording via
 * `/billing/invoices/:invoiceId/record-payment`, and reminders
 * (`sendInvoiceReminder()`). Non-lawyers see the table read-only.
 */
function StaffBillingView() {
  const navigate = useNavigate()
  const location = useLocation()
  const profile = loadProfile()
  const canManage = profile?.role_id === LAWYER
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [timeFilter, setTimeFilter] = useState<(typeof TIME_FILTERS)[number]>('All Time')
  const [toast, setToast] = useState<string | null>((location.state as { toast?: string } | null)?.toast ?? null)

  const [remindingId, setRemindingId] = useState<number | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (!toast) return
    window.history.replaceState({}, '')
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  function refresh() {
    setLoading(true)
    listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoices.'))
      .finally(() => setLoading(false))
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function remind(inv: InvoiceSummary) {
    setRemindingId(inv.id)
    try {
      await sendInvoiceReminder(inv.id)
      showToast('Reminder sent.')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send reminder.')
    } finally {
      setRemindingId(null)
    }
  }

  const searchLower = search.toLowerCase()
  const filtered = invoices.filter((inv) => {
    const status = displayStatus(inv)
    const matchesSearch = !searchLower || inv.invoice_number.toLowerCase().includes(searchLower) || (inv.client ?? '').toLowerCase().includes(searchLower) || (inv.case_number ?? '').toLowerCase().includes(searchLower)
    const matchesStatus = statusFilter === 'All' || status === statusFilter
    const matchesTime = withinTimeFilter(inv.issue_date, timeFilter)
    return matchesSearch && matchesStatus && matchesTime
  })

  const totalBilled = invoices.reduce((sum, i) => sum + i.total_amount, 0)
  const totalOutstanding = invoices.filter((i) => i.payment_status !== 'Paid').reduce((sum, i) => sum + i.total_amount, 0)
  const totalCollected = invoices.filter((i) => i.payment_status === 'Paid').reduce((sum, i) => sum + i.total_amount, 0)
  const totalGst = invoices.reduce((sum, i) => sum + (i.tax ?? 0), 0)
  const pendingCount = invoices.filter((i) => i.payment_status !== 'Paid').length
  const recoveryPct = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        {canManage && <div className={styles.breadcrumb}><span>Dashboard</span><span>›</span><span>Billing &amp; Invoices</span></div>}

        <div className={styles.header}>
          <div>
            <div className={styles.title}>{canManage ? 'Billing & Invoices' : 'Invoices'}</div>
            <div className={styles.subtitle}>{canManage ? 'Track professional fees, GST and collections across every client engagement.' : 'Your invoices and payment status.'}</div>
          </div>
          {canManage && <div className={styles.primaryChip} onClick={() => navigate('/billing/invoices/generate')}>+ Generate Invoice</div>}
        </div>

        <div className={styles.statCards}>
          <div className={styles.statCard} style={{ gap: 4 }}>
            <div className={styles.statIconRow}>
              <div className={styles.statLabel} style={{ margin: 0 }}>Total Billed</div>
              <div className={styles.statIconWrap}><Icon name="file-text" size={16} color={PRIMARY} /></div>
            </div>
            <div className={styles.statValue} style={{ fontSize: 22 }}>{moneyRound(totalBilled)}</div>
            <div style={{ fontSize: 11.5, color: MUTED }}>Professional fees, all invoices</div>
          </div>
          <div className={styles.statCard} style={{ gap: 4 }}>
            <div className={styles.statIconRow}>
              <div className={styles.statLabel} style={{ margin: 0 }}>Revenue Collected</div>
              <div className={styles.statIconWrap}><Icon name="bar-chart-2" size={16} color={PRIMARY} /></div>
            </div>
            <div className={styles.statValue} style={{ fontSize: 22 }}>{moneyRound(totalCollected)}</div>
            <div style={{ fontSize: 11.5, color: MUTED }}>{recoveryPct}% recovery rate</div>
            <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${recoveryPct}%` }} /></div>
          </div>
          <div className={styles.statCard} style={{ gap: 4 }}>
            <div className={styles.statIconRow}>
              <div className={styles.statLabel} style={{ margin: 0 }}>Outstanding Balance</div>
              <div className={styles.statIconWrap}><Icon name="info" size={16} color={PRIMARY} /></div>
            </div>
            <div className={styles.statValue} style={{ fontSize: 22 }}>{moneyRound(totalOutstanding)}</div>
            <div style={{ fontSize: 11.5, color: '#B3282D' }}>{pendingCount} Invoices Pending</div>
          </div>
          <div className={styles.statCard} style={{ gap: 4 }}>
            <div className={styles.statIconRow}>
              <div className={styles.statLabel} style={{ margin: 0 }}>GST Accrued</div>
              <div className={styles.statIconWrap}><Icon name="receipt" size={16} color={PRIMARY} /></div>
            </div>
            <div className={styles.statValue} style={{ fontSize: 22 }}>{moneyRound(totalGst)}</div>
            <div style={{ fontSize: 11.5, color: MUTED }}>Estimated across all invoices</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Invoice ID, Client, or Case Name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 3, border: '1px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '9px 12px', borderRadius: 3, border: '1px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }}>
            {['All', 'Paid', 'Partially Paid', 'Pending', 'Overdue'].map((s) => <option key={s} value={s}>{s === 'All' ? 'Status: All' : s}</option>)}
          </select>
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as (typeof TIME_FILTERS)[number])} style={{ padding: '9px 12px', borderRadius: 3, border: '1px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }}>
            {TIME_FILTERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className={styles.ghostChip} style={{ opacity: .5, cursor: 'default' }} title="Report export coming soon"><Icon name="download" size={14} color="#575145" /> Export Report</div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading invoices…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Invoice No.</th>
                  <th className={styles.th}>Client</th>
                  <th className={styles.th}>Case Reference</th>
                  <th className={styles.th}>Professional Fees</th>
                  <th className={styles.th}>GST</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const status = displayStatus(inv)
                  const [color, bg] = STATUS_STYLE_MAP[status] || DEFAULT_STATUS_STYLE
                  return (
                    <tr key={inv.id} className={styles.tr}>
                      <td className={styles.tdMono} style={{ color: status === 'Overdue' ? '#B3282D' : undefined, fontWeight: status === 'Overdue' ? 700 : undefined }}>{inv.invoice_number}</td>
                      <td className={styles.tdClient}>{inv.client ?? '—'}</td>
                      <td className={styles.tdMono}>{inv.case_number ?? '—'}</td>
                      <td className={styles.td}>{money(inv.amount)}</td>
                      <td className={styles.td}>{inv.tax != null ? money(inv.tax) : '—'}</td>
                      <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{status}</span></td>
                      <td className={styles.td}>
                        {canManage && (
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            {status !== 'Paid' && (
                              <div
                                onClick={() => remindingId !== inv.id && remind(inv)}
                                style={{ fontSize: 11.5, fontWeight: 600, color: '#B3282D', border: '1px solid #E9B8B8', borderRadius: 3, padding: '6px 10px', cursor: 'pointer', opacity: remindingId === inv.id ? 0.6 : 1, whiteSpace: 'nowrap' }}
                              >
                                {remindingId === inv.id ? 'Sending…' : 'Send Reminder'}
                              </div>
                            )}
                            {inv.payment_status !== 'Paid' && (
                              <div
                                onClick={() => navigate(`/billing/invoices/${inv.id}/record-payment`)}
                                style={{ fontSize: 11.5, fontWeight: 600, color: '#575145', border: '1px solid #CFC6B0', borderRadius: 3, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                Record Payment
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td className={styles.td} colSpan={7} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No invoices found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </div>
  )
}

const TXN_STATUS_STYLE: Record<string, [string, string]> = {
  Completed: ['#4A6B4E', '#E4EDE5'],
  Pending: ['#8A6A2F', '#F3EBD9'],
  Failed: ['#B3282D', '#F7E4E5'],
}
const TXN_DEFAULT_STYLE: [string, string] = ['#575145', '#F0ECDF']

/** Client-facing invoice view: loads invoices (`listInvoices()`) plus each one's payments (`listInvoicePayments()`) to compute totals, progress, and a recent-transactions list. Pay Now opens Razorpay Checkout via `payInvoice()`; Download opens a printable summary via `downloadInvoice()`; Download All has no bulk export yet, so it just toasts. */
/** Opens a new tab with a minimal printable invoice summary and triggers the browser's print dialog (save-as-PDF) -- invoices have no stored line items, only the totals in `InvoiceSummary`, so this isn't the itemized letterhead from GenerateInvoicePage. */
function downloadInvoice(inv: InvoiceSummary) {
  const win = window.open('', '_blank')
  if (!win) return
  const rows = [
    ['Amount', moneyRound(inv.amount)],
    ...(inv.tax ? [['Tax', moneyRound(inv.tax)]] : []),
  ]
  win.document.write(`<!doctype html><html><head><title>${inv.invoice_number}</title>
    <style>
      body{font-family:'Spectral',serif;color:#1A1A17;padding:48px;max-width:560px;margin:0 auto}
      .muted{color:#6E6759;font-size:12.5px}
      table{width:100%;border-collapse:collapse;margin-top:24px}
      td{padding:8px 0;font-size:14px;border-top:1px solid #CFC6B0}
      td:last-child{text-align:right;font-weight:600}
      .total td{font-weight:700;font-size:17px;border-top:2px solid #1A1A17}
    </style></head>
    <body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="font-size:20px;font-weight:700">LexFlow</div>
        <div class="muted">INVOICE</div>
      </div>
      <div class="muted" style="margin-top:4px">${inv.invoice_number} &middot; Issued ${formatDate(inv.issue_date)}</div>
      <div style="margin-top:24px">
        <div class="muted" style="text-transform:uppercase;font-size:10.5px;font-weight:700">Bill To</div>
        <div style="font-weight:700;margin-top:2px">${inv.client ?? '—'}</div>
        ${inv.case_number ? `<div class="muted">Matter: ${inv.case_number}</div>` : ''}
      </div>
      <table>
        ${rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('')}
        <tr class="total"><td>Total Due</td><td>${moneyRound(inv.total_amount)}</td></tr>
      </table>
      <div class="muted" style="margin-top:16px">Status: ${inv.payment_status}${inv.due_date ? ' &middot; Due ' + formatDate(inv.due_date) : ''}</div>
    </body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

function ClientInvoicesView() {
  const [profile] = useState<UserProfile | null>(loadProfile)
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Map<number, PaymentSummary[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<number | null>(null)

  function fireAction(label: string) {
    setToast(`${label}…`)
    setTimeout(() => setToast(null), 1800)
  }

  function refresh() {
    return listInvoices().then((invs) => {
      setInvoices(invs)
      return Promise.all(invs.map((inv) => listInvoicePayments(inv.id).catch(() => [] as PaymentSummary[])))
        .then((lists) => setPaymentsByInvoice(new Map(invs.map((inv, i) => [inv.id, lists[i]]))))
    })
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoices.'))
      .finally(() => setLoading(false))
  }, [])

  /** Opens Razorpay Checkout for an invoice: creates an order server-side, launches the modal,
   * and on success posts the payment fields back for signature verification -- see
   * verify_razorpay_payment() in the backend, which is the one that actually records the
   * payment (the client-side `handler` firing is not itself proof of payment). */
  async function payInvoice(inv: InvoiceSummary) {
    if (!window.Razorpay) {
      fireAction('Payment gateway failed to load')
      return
    }
    setPayingId(inv.id)
    try {
      const order = await createRazorpayOrder(inv.id)
      const razorpay = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'LexFlow',
        description: `Invoice ${inv.invoice_number}`,
        prefill: { name: profile?.full_name, email: profile?.email, contact: profile?.phone },
        theme: { color: '#23306B' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await verifyRazorpayPayment(inv.id, response)
            fireAction('Payment received')
            refresh().catch(() => {})
          } catch (err) {
            fireAction(err instanceof Error ? err.message : 'Payment verification failed')
          } finally {
            setPayingId(null)
          }
        },
        modal: { ondismiss: () => setPayingId(null) },
      })
      razorpay.open()
    } catch (err) {
      fireAction(err instanceof Error ? err.message : 'Could not start payment')
      setPayingId(null)
    }
  }

  const searchLower = search.toLowerCase()
  const filtered = invoices.filter((inv) =>
    !searchLower || inv.invoice_number.toLowerCase().includes(searchLower) || inv.payment_status.toLowerCase().includes(searchLower)
  )

  const pendingInvoices = invoices.filter((i) => i.payment_status !== 'Paid')
  const paidInvoices = invoices.filter((i) => i.payment_status === 'Paid')
  const totalFees = invoices.reduce((sum, i) => sum + i.total_amount, 0)
  const allPayments = [...paymentsByInvoice.values()].flat()
  const amountPaid = allPayments.filter((p) => p.payment_status === 'Completed').reduce((sum, p) => sum + p.amount, 0)
  const outstanding = totalFees - amountPaid
  const progressPct = totalFees > 0 ? Math.round((amountPaid / totalFees) * 100) : 0
  const nearestDue = pendingInvoices.map((i) => i.due_date).filter((d): d is string => !!d).sort()[0]

  const recentTransactions = invoices
    .flatMap((inv) => (paymentsByInvoice.get(inv.id) ?? []).map((p) => ({ ...p, invoice_number: inv.invoice_number })))
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
    .slice(0, 8)

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Invoices</div>
            <div className={styles.subtitle}>Review and pay outstanding invoices.</div>
          </div>
          <div className={styles.primaryChip} onClick={() => fireAction('Preparing download')}>Download All</div>
        </div>

        <input
          placeholder="Search by invoice number or status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 3, border: '1px solid #CFC6B0', fontSize: 13.5, background: '#FCFAF4' }}
        />

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading invoices…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.statCards} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className={styles.statCard} style={{ background: '#FEF6EA', border: '1px solid #F3EBD9' }}>
                <div className={styles.statIconRow}>
                  <div className={styles.statIconWrap} style={{ background: '#F3EBD9' }}><Icon name="clock" size={16} color="#8A6A2F" /></div>
                  <span className={styles.statusBadge} style={{ color: '#8A6A2F', background: '#F3EBD9' }}>OPEN</span>
                </div>
                <div className={styles.statValue}>{pendingInvoices.length}</div>
                <div className={styles.statLabel}>Pending</div>
                <div style={{ fontSize: 11.5, color: MUTED }}>Awaiting payment</div>
              </div>
              <div className={styles.statCard} style={{ background: '#EEF9F1', border: '1px solid #BFE6CB' }}>
                <div className={styles.statIconRow}>
                  <div className={styles.statIconWrap} style={{ background: '#BFE6CB' }}><Icon name="check-circle" size={16} color="#4A6B4E" /></div>
                  <span className={styles.statusBadge} style={{ color: '#4A6B4E', background: '#E4EDE5' }}>CLEARED</span>
                </div>
                <div className={styles.statValue}>{paidInvoices.length}</div>
                <div className={styles.statLabel}>Paid</div>
                <div style={{ fontSize: 11.5, color: MUTED }}>Settled invoices</div>
              </div>
              <div className={styles.statCard} style={{ background: '#23306B', border: '1px solid #23306B' }}>
                <div className={styles.statIconRow}>
                  <div className={styles.statIconWrap} style={{ background: '#33302A' }}><Icon name="banknote" size={16} color="#CFC6B0" /></div>
                  <span className={styles.statusBadge} style={{ color: '#CFC6B0', background: '#33302A' }}>TOTAL</span>
                </div>
                <div className={styles.statValue} style={{ color: '#FCFAF4' }}>{moneyRound(outstanding)}</div>
                <div className={styles.statLabel} style={{ color: '#CFC6B0' }}>Total Due</div>
                <div style={{ fontSize: 11.5, color: '#A8987C' }}>Across all invoices</div>
              </div>
            </div>

            <div className={styles.midGrid}>
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Invoice</th>
                      <th className={styles.th}>Amount</th>
                      <th className={styles.th}>Due Date</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th} style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((inv) => {
                      const [color, bg] = STATUS_STYLE_MAP[inv.payment_status] || DEFAULT_STATUS_STYLE
                      return (
                        <tr key={inv.id} className={styles.tr}>
                          <td className={styles.tdMono}>{inv.invoice_number}</td>
                          <td className={styles.td}>{moneyRound(inv.total_amount)}</td>
                          <td className={styles.td}>{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                          <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{inv.payment_status}</span></td>
                          <td className={styles.td}>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {inv.payment_status !== 'Paid' && (
                                <div className={styles.darkBtn} style={{ opacity: payingId === inv.id ? .6 : 1, cursor: payingId === inv.id ? 'default' : 'pointer' }} onClick={() => payingId !== inv.id && payInvoice(inv)}>
                                  {payingId === inv.id ? 'Processing…' : 'Pay Now'}
                                </div>
                              )}
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#23306B', cursor: 'pointer' }} onClick={() => downloadInvoice(inv)}>Download</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && (
                      <tr><td className={styles.td} colSpan={5} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No invoices found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className={styles.sideCol}>
                <div className={styles.panelCard}>
                  <div className={styles.panelTitle}>Payment Summary</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: MUTED }}>Total Fees</span><strong>{moneyRound(totalFees)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: MUTED }}>Amount Paid</span><strong style={{ color: '#4A6B4E' }}>{moneyRound(amountPaid)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: MUTED }}>Outstanding</span><strong style={{ color: '#B3282D' }}>{moneyRound(outstanding)}</strong></div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em', fontWeight: 700, marginBottom: 6 }}><span>Payment Progress</span><span>{progressPct}%</span></div>
                      <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${progressPct}%` }} /></div>
                    </div>
                    <div style={{ border: '1px solid #CFC6B0', borderRadius: 3, padding: '10px 12px', marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 9.5, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em', fontWeight: 700 }}>Next Due Date</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A17', marginTop: 2 }}>{nearestDue ? formatDate(nearestDue) : '—'}</div>
                      </div>
                      <Icon name="calendar" size={18} color="#23306B" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.tableCard}>
              <div className={styles.tableHead}>
                <div className={styles.tableHeadTitle}>Recent Transactions</div>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Transaction ID</th>
                    <th className={styles.th}>Invoice #</th>
                    <th className={styles.th}>Amount</th>
                    <th className={styles.th}>Method</th>
                    <th className={styles.th}>Date</th>
                    <th className={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((t) => {
                    const [color, bg] = TXN_STATUS_STYLE[t.payment_status] || TXN_DEFAULT_STYLE
                    return (
                      <tr key={t.payment_id} className={styles.tr}>
                        <td className={styles.tdMono}>{t.transaction_reference ?? `TXN-${t.payment_id}`}</td>
                        <td className={styles.tdMono}>{t.invoice_number}</td>
                        <td className={styles.td}>{moneyRound(t.amount)}</td>
                        <td className={styles.td}>{t.payment_method ?? '—'}</td>
                        <td className={styles.td}>{formatDate(t.payment_date)}</td>
                        <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{t.payment_status}</span></td>
                      </tr>
                    )
                  })}
                  {recentTransactions.length === 0 && (
                    <tr><td className={styles.td} colSpan={6} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No transactions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </div>
  )
}
