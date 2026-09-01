/** `/billing` route: role-dispatches to a lawyer-facing management view (`StaffBillingView`) or a read-only client view (`ClientInvoicesView`). */
import { useEffect, useState } from 'react'
import { listInvoices, createInvoice, createPayment, sendInvoiceReminder, listCases, listInvoicePayments } from '../../api/client'
import type { InvoiceSummary, CaseSummary, PaymentSummary, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const LAWYER = 2
const CLIENT = 3

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const MUTED = '#8C7C5E'
const PRIMARY = '#B08D3E'
const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  Paid: ['#2E9E58', '#E4F5EA'],
  'Partially Paid': ['#B87F1E', '#FFF2E0'],
  Pending: ['#B87F1E', '#FFF2E0'],
  Overdue: ['#B05C5C', '#FBEAEA'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#6A5C42', '#EFEAE1']
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
 * Lawyer/admin invoice management: loads invoices via `listInvoices()`
 * (and cases via `listCases()` for the generate-invoice form), with
 * search/status/time filtering, invoice creation (`createInvoice()`),
 * full-payment recording (`createPayment()`), and reminders
 * (`sendInvoiceReminder()`). Non-lawyers see the table read-only.
 */
function StaffBillingView() {
  const profile = loadProfile()
  const canManage = profile?.role_id === LAWYER
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [timeFilter, setTimeFilter] = useState<(typeof TIME_FILTERS)[number]>('All Time')
  const [toast, setToast] = useState<string | null>(null)

  const [genOpen, setGenOpen] = useState(false)
  const [genCaseId, setGenCaseId] = useState('')
  const [genInvoiceNumber, setGenInvoiceNumber] = useState('')
  const [genAmount, setGenAmount] = useState('')
  const [genTax, setGenTax] = useState('')
  const [genDueDate, setGenDueDate] = useState('')
  const [genError, setGenError] = useState('')
  const [saving, setSaving] = useState(false)

  const [payingId, setPayingId] = useState<number | null>(null)
  const [remindingId, setRemindingId] = useState<number | null>(null)

  useEffect(() => {
    refresh()
    if (canManage) listCases().then(setCases).catch(() => {})
  }, [])

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

  function openGenerate() {
    setGenOpen(true)
    setGenCaseId('')
    setGenInvoiceNumber(`INV-${Date.now().toString().slice(-6)}`)
    setGenAmount('')
    setGenTax('')
    setGenDueDate('')
    setGenError('')
  }

  async function submitGenerate() {
    const amount = Number(genAmount)
    const tax = genTax ? Number(genTax) : 0
    if (!genCaseId) { setGenError('Choose a case.'); return }
    if (!genInvoiceNumber.trim()) { setGenError('Enter an invoice number.'); return }
    if (!amount || amount <= 0) { setGenError('Enter a valid amount.'); return }
    setSaving(true)
    setGenError('')
    try {
      const created = await createInvoice({
        case_id: Number(genCaseId),
        invoice_number: genInvoiceNumber.trim(),
        amount,
        tax,
        total_amount: amount + tax,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: genDueDate || undefined,
      })
      setInvoices((prev) => [created, ...prev])
      setGenOpen(false)
      showToast('Invoice generated.')
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate invoice.')
    } finally {
      setSaving(false)
    }
  }

  async function recordFullPayment(inv: InvoiceSummary) {
    setPayingId(inv.id)
    try {
      await createPayment({
        invoice_id: inv.id,
        amount: inv.total_amount,
        payment_method: 'Bank Transfer',
        payment_date: new Date().toISOString().slice(0, 10),
      })
      refresh()
      showToast('Payment recorded.')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record payment.')
    } finally {
      setPayingId(null)
    }
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
          {canManage && <div className={styles.primaryChip} onClick={openGenerate}>+ Generate Invoice</div>}
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
            <div style={{ fontSize: 11.5, color: '#B05C5C' }}>{pendingCount} Invoices Pending</div>
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
            style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
            {['All', 'Paid', 'Partially Paid', 'Pending', 'Overdue'].map((s) => <option key={s} value={s}>{s === 'All' ? 'Status: All' : s}</option>)}
          </select>
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as (typeof TIME_FILTERS)[number])} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
            {TIME_FILTERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className={styles.ghostChip} style={{ opacity: .5, cursor: 'default' }} title="Report export coming soon"><Icon name="download" size={14} color="#6A5C42" /> Export Report</div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading invoices…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

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
                      <td className={styles.tdMono} style={{ color: status === 'Overdue' ? '#B05C5C' : undefined, fontWeight: status === 'Overdue' ? 700 : undefined }}>{inv.invoice_number}</td>
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
                                style={{ fontSize: 11.5, fontWeight: 600, color: '#B05C5C', border: '1px solid #E9B8B8', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', opacity: remindingId === inv.id ? 0.6 : 1, whiteSpace: 'nowrap' }}
                              >
                                {remindingId === inv.id ? 'Sending…' : 'Send Reminder'}
                              </div>
                            )}
                            {inv.payment_status !== 'Paid' && (
                              <div
                                onClick={() => payingId !== inv.id && recordFullPayment(inv)}
                                style={{ fontSize: 11.5, fontWeight: 600, color: '#6A5C42', border: '1px solid #E7DCC6', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', opacity: payingId === inv.id ? 0.6 : 1, whiteSpace: 'nowrap' }}
                              >
                                {payingId === inv.id ? 'Recording…' : 'Record Payment'}
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

        {genOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setGenOpen(false)}>
            <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 380, boxShadow: '0 20px 48px rgba(0,0,0,.2)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 700, color: '#2A2118', marginBottom: 16 }}>Generate Invoice</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Case</div>
                  <select value={genCaseId} onChange={(e) => setGenCaseId(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}>
                    <option value="">Select a case…</option>
                    {cases.map((c) => <option key={c.case_id} value={c.case_id}>{c.id} — {c.client ?? 'No client'}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Invoice number</div>
                  <input value={genInvoiceNumber} onChange={(e) => setGenInvoiceNumber(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Fees</div>
                    <input type="number" min="0" value={genAmount} onChange={(e) => setGenAmount(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Tax</div>
                    <input type="number" min="0" value={genTax} onChange={(e) => setGenTax(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Due date (optional)</div>
                  <input type="date" value={genDueDate} onChange={(e) => setGenDueDate(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }} />
                </div>

                {genError && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{genError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <div className={styles.ghostChip} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setGenOpen(false)}>Cancel</div>
                  <div className={styles.primaryChip} style={{ flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1, pointerEvents: saving ? 'none' : 'auto' }} onClick={submitGenerate}>
                    {saving ? 'Generating…' : 'Generate'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const TXN_STATUS_STYLE: Record<string, [string, string]> = {
  Completed: ['#2E9E58', '#E4F5EA'],
  Pending: ['#B87F1E', '#FFF2E0'],
  Failed: ['#B05C5C', '#FBEAEA'],
}
const TXN_DEFAULT_STYLE: [string, string] = ['#6A5C42', '#EFEAE1']

/** Client-facing invoice view: loads invoices (`listInvoices()`) plus each one's payments (`listInvoicePayments()`) to compute totals, progress, and a recent-transactions list. Read-only; pay/download actions are disabled placeholders. */
function ClientInvoicesView() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Map<number, PaymentSummary[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    listInvoices()
      .then((invs) => {
        setInvoices(invs)
        return Promise.all(invs.map((inv) => listInvoicePayments(inv.id).catch(() => [] as PaymentSummary[])))
          .then((lists) => setPaymentsByInvoice(new Map(invs.map((inv, i) => [inv.id, lists[i]]))))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoices.'))
      .finally(() => setLoading(false))
  }, [])

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
          <div className={styles.primaryChip} style={{ opacity: .5, cursor: 'default' }} title="PDF export coming soon">Download All</div>
        </div>

        <input
          placeholder="Search by invoice number or status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
        />

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading invoices…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.statCards} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className={styles.statCard} style={{ background: '#FEF6EA', border: '1px solid #F3DFAE' }}>
                <div className={styles.statIconRow}>
                  <div className={styles.statIconWrap} style={{ background: '#F3DFAE' }}><Icon name="alert-triangle" size={16} color="#B87F1E" /></div>
                  <span className={styles.statusBadge} style={{ color: '#B87F1E', background: '#FFF2E0' }}>OPEN</span>
                </div>
                <div className={styles.statValue}>{pendingInvoices.length}</div>
                <div className={styles.statLabel}>Pending</div>
                <div style={{ fontSize: 11.5, color: MUTED }}>Awaiting payment</div>
              </div>
              <div className={styles.statCard} style={{ background: '#EEF9F1', border: '1px solid #BFE6CB' }}>
                <div className={styles.statIconRow}>
                  <div className={styles.statIconWrap} style={{ background: '#BFE6CB' }}><Icon name="check-circle" size={16} color="#2E9E58" /></div>
                  <span className={styles.statusBadge} style={{ color: '#2E9E58', background: '#E4F5EA' }}>CLEARED</span>
                </div>
                <div className={styles.statValue}>{paidInvoices.length}</div>
                <div className={styles.statLabel}>Paid</div>
                <div style={{ fontSize: 11.5, color: MUTED }}>Settled invoices</div>
              </div>
              <div className={styles.statCard} style={{ background: '#2A2118', border: '1px solid #2A2118' }}>
                <div className={styles.statIconRow}>
                  <div className={styles.statIconWrap} style={{ background: '#3D3126' }}><Icon name="banknote" size={16} color="#D8C9A8" /></div>
                  <span className={styles.statusBadge} style={{ color: '#D8C9A8', background: '#3D3126' }}>TOTAL</span>
                </div>
                <div className={styles.statValue} style={{ color: '#FFFFFF' }}>{moneyRound(outstanding)}</div>
                <div className={styles.statLabel} style={{ color: '#D8C9A8' }}>Total Due</div>
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
                      <th className={styles.th}></th>
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
                                <div className={styles.darkBtn} style={{ opacity: .5, cursor: 'default' }} title="Online payments coming soon">Pay Now</div>
                              )}
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#B08D3E', opacity: .5, cursor: 'default' }} title="PDF export coming soon">Download</span>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: MUTED }}>Amount Paid</span><strong style={{ color: '#2E9E58' }}>{moneyRound(amountPaid)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: MUTED }}>Outstanding</span><strong style={{ color: '#B05C5C' }}>{moneyRound(outstanding)}</strong></div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700, marginBottom: 6 }}><span>Payment Progress</span><span>{progressPct}%</span></div>
                      <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${progressPct}%` }} /></div>
                    </div>
                    <div style={{ border: '1px solid #E7DCC6', borderRadius: 10, padding: '10px 12px', marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700 }}>Next Due Date</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#2A2118', marginTop: 2 }}>{nearestDue ? formatDate(nearestDue) : '—'}</div>
                      </div>
                      <Icon name="calendar" size={18} color="#B08D3E" />
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
      </div>
    </div>
  )
}
