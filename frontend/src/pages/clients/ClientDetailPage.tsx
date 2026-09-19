/** `/clients/:clientId` route (lawyer/admin): one client's record -- contact facts, the cases
 * they're on, their invoices, and the trust account holding their money. Reads an optional
 * `location.state.toast` (set by `RecordPaymentPage` when it navigates back here). */
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { listClients, listCases, listInvoices, listHearings, getOrCreateConversation, getTrustBalance, getTrustLedger, createTrustTransaction, payInvoiceFromTrust } from '../../api/client'
import type { ClientSummary, CaseSummary, InvoiceSummary, HearingSummary, TrustTransaction } from '../../types/api'
import { formatDate } from '../../utils/date'
import { Icon } from '../../components/icons'
import { Card, Empty, Fact } from '../cases/CaseDetailPage'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'
import cd from '../cases/cases.module.css'

const MUTED = '#6E6759'

const CLIENT_STATUS_STYLE: Record<string, [string, string]> = {
  Active: ['#4A6B4E', '#E4EDE5'],
  Pending: ['#8A6A2F', '#F3EBD9'],
  Closed: ['#575145', '#F0ECDF'],
}
const CASE_STATUS_STYLE: Record<string, [string, string]> = {
  Completed: ['#4A6B4E', '#E4EDE5'],
  Closed: ['#4A6B4E', '#E4EDE5'],
  Open: ['#8A6A2F', '#F3EBD9'],
  'In Progress': ['#8A6A2F', '#F3EBD9'],
  Pending: ['#8A6A2F', '#F3EBD9'],
}
const HEARING_STATUS_STYLE: Record<string, [string, string]> = {
  Scheduled: ['#8A6A2F', '#F3EBD9'],
  Completed: ['#4A6B4E', '#E4EDE5'],
  Adjourned: ['#575145', '#F0ECDF'],
  Cancelled: ['#B3282D', '#F7E4E5'],
}
const INVOICE_STATUS_STYLE: Record<string, [string, string]> = {
  Paid: ['#4A6B4E', '#E4EDE5'],
  'Partially Paid': ['#8A6A2F', '#F3EBD9'],
  Pending: ['#8A6A2F', '#F3EBD9'],
  Overdue: ['#B3282D', '#F7E4E5'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#575145', '#F0ECDF']
const TRUST_INPUT = { padding: '8px 10px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13, flex: 1, minWidth: 0 }

function statusLabel(s: string) {
  return s === 'Open' ? 'Active' : s
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function moneyRound(n: number) {
  return `₹${Math.round(n).toLocaleString()}`
}

function money(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TRUST_LABELS: Record<TrustTransaction['type'], string> = {
  deposit: 'Deposit',
  disbursement: 'Disbursement',
  invoice_payment: 'Paid to invoice',
}

/**
 * Loads all clients via `listClients()` and finds this one by `clientId` (there's no
 * single-client GET endpoint -- same shape `CaseDetailPage` uses), plus every case and
 * invoice, keeping the ones belonging to this client.
 */
export default function ClientDetailPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const id = Number(clientId)

  const [client, setClient] = useState<ClientSummary | null>(null)
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messaging, setMessaging] = useState(false)
  const [toast, setToast] = useState<string | null>((location.state as { toast?: string } | null)?.toast ?? null)
  const [trustBalance, setTrustBalance] = useState<number | null>(null)
  const [trustLedger, setTrustLedger] = useState<TrustTransaction[]>([])
  const [trustForm, setTrustForm] = useState<{ type: 'deposit' | 'disbursement'; amount: string; description: string } | null>(null)
  const [trustBusy, setTrustBusy] = useState(false)

  useEffect(() => {
    if (!id) { setError('Invalid client.'); setLoading(false); return }
    Promise.all([listClients(), listCases(), listInvoices(), listHearings()])
      .then(([clients, allCases, allInvoices, allHearings]) => {
        const found = clients.find((c) => c.id === id)
        if (!found) { setError("This client doesn't exist or you don't have access to them."); return }
        setClient(found)
        const theirCases = allCases.filter((c) => c.client_id === id)
        setCases(theirCases)
        // invoices carry the case_number string, which is CaseSummary.id
        const caseNumbers = new Set(theirCases.map((c) => c.id))
        setInvoices(allInvoices.filter((inv) => inv.case_number && caseNumbers.has(inv.case_number)))
        const caseIds = new Set(theirCases.map((c) => c.case_id))
        setHearings(
          allHearings
            .filter((h) => caseIds.has(h.case_id))
            .sort((a, b) => a.hearing_date.localeCompare(b.hearing_date)),
        )
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this client.'))
      .finally(() => setLoading(false))
    loadTrust()
  }, [id])

  // Kept out of the Promise.all above: a firm that hasn't run the trust migration yet
  // should still get the rest of the page rather than an error.
  function loadTrust() {
    Promise.all([getTrustBalance(id), getTrustLedger(id)])
      .then(([b, l]) => { setTrustBalance(b.balance); setTrustLedger(l.transactions) })
      .catch(() => {})
  }

  async function submitTrust() {
    if (!trustForm) return
    const amount = Number(trustForm.amount)
    if (!(amount > 0)) { setToast('Enter an amount greater than zero.'); return }
    setTrustBusy(true)
    try {
      await createTrustTransaction({
        client_id: id,
        type: trustForm.type,
        amount,
        transaction_date: new Date().toISOString().slice(0, 10),
        description: trustForm.description.trim() || undefined,
      })
      setTrustForm(null)
      loadTrust()
      setToast(trustForm.type === 'deposit' ? 'Deposit recorded.' : 'Disbursement recorded.')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to record that transaction.')
    } finally {
      setTrustBusy(false)
    }
  }

  async function payFromTrust(invoiceId: number) {
    setTrustBusy(true)
    try {
      const res = await payInvoiceFromTrust(invoiceId)
      setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, payment_status: 'Paid' } : inv)))
      loadTrust()
      setToast(`Paid ${money(res.amount_paid)} from trust.`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to pay from trust.')
    } finally {
      setTrustBusy(false)
    }
  }

  useEffect(() => {
    if (!toast) return
    window.history.replaceState({}, '')
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  async function messageClient() {
    setMessaging(true)
    try {
      const conversation = await getOrCreateConversation(id)
      navigate(`/messages/${conversation.id}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to open conversation.')
    } finally {
      setMessaging(false)
    }
  }

  if (loading) return <div className={styles.page}><div className={styles.wrap}><div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading client…</div></div></div>
  if (error || !client) return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>
        <div className={styles.ghostChip} style={{ width: 'fit-content' }} onClick={() => navigate('/clients')}>Back to clients</div>
      </div>
    </div>
  )

  const [statusColor, statusBg] = CLIENT_STATUS_STYLE[client.status] || DEFAULT_STATUS_STYLE
  const outstanding = invoices.filter((inv) => inv.payment_status !== 'Paid').reduce((sum, inv) => sum + inv.total_amount, 0)

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.breadcrumb}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/clients')}>Clients</span>
          <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><Icon name="chevron-down" size={13} color="#8C857A" /></span>
          <span>{client.full_name}</span>
        </div>

        <div className={cd.record}>
          <div className={cd.recordTop}>
            <div className={cd.clientRow} style={{ minWidth: 0 }}>
              <div className={cd.avatar}>{initialsOf(client.full_name)}</div>
              <div style={{ minWidth: 0 }}>
                <h1 className={cd.caseTitle} style={{ marginTop: 0 }}>{client.full_name}</h1>
                <div className={cd.badges}>
                  <span className={styles.statusBadge} style={{ color: statusColor, background: statusBg }}>{client.status}</span>
                  <span className={styles.statusBadge} style={{ color: '#575145', background: '#F0ECDF' }}>{client.active_cases} active case{client.active_cases === 1 ? '' : 's'}</span>
                  {outstanding > 0 && (
                    <span className={styles.statusBadge} style={{ color: '#B3282D', background: '#F7E4E5' }}>{moneyRound(outstanding)} outstanding</span>
                  )}
                </div>
              </div>
            </div>

            <div className={cd.actions}>
              <div
                className={styles.primaryChip}
                style={{ opacity: messaging ? 0.6 : 1, cursor: messaging ? 'default' : 'pointer' }}
                onClick={() => !messaging && messageClient()}
              >
                <Icon name="message-circle" size={15} color="#FCFAF4" /> {messaging ? 'Opening…' : 'Message'}
              </div>
              <a href={`mailto:${client.email}`} className={styles.ghostChip} style={{ textDecoration: 'none' }}>
                <Icon name="mail" size={15} color={MUTED} /> Email
              </a>
              {client.phone && (
                <a href={`tel:${client.phone}`} className={styles.ghostChip} style={{ textDecoration: 'none' }}>
                  <Icon name="phone" size={15} color={MUTED} /> Call
                </a>
              )}
            </div>
          </div>

          <div className={cd.facts}>
            <Fact label="Email" value={client.email} />
            <Fact label="Phone" value={client.phone || 'Not recorded'} />
            <Fact label="Address" value={client.address || 'Not recorded'} />
            <Fact label="Preferred language" value={client.preferred_language || 'Not set'} />
          </div>
        </div>

        <div className={cd.columns}>
          <div className={cd.col}>
            <Card title="Cases" count={cases.length}>
              {cases.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cases.map((c) => {
                    const [color, bg] = CASE_STATUS_STYLE[c.status] || DEFAULT_STATUS_STYLE
                    return (
                      <div key={c.case_id} className={`${cd.listRow} ${cd.listRowLink}`} onClick={() => navigate(`/cases/${c.case_id}`)}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div className={cd.caseNumber}>{c.id}</div>
                            <div className={cd.rowTitle} style={{ marginTop: 2 }}>{c.case_title ?? c.court ?? 'Untitled case'}</div>
                          </div>
                          <span className={styles.statusBadge} style={{ color, background: bg, flexShrink: 0 }}>{statusLabel(c.status)}</span>
                        </div>
                        <div className={cd.metaRow}>
                          <span>{c.case_type ?? 'Type not set'}</span>
                          <span>{c.hearing ? `Next hearing ${formatDate(c.hearing)}` : 'No hearing scheduled'}</span>
                          <span>{c.lawyer ?? 'No lawyer assigned'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty>No cases on file for this client yet.</Empty>
              )}
            </Card>

            <Card
              title="Trust account"
              action={
                trustForm ? null : (
                  <button className={cd.linkAction} onClick={() => setTrustForm({ type: 'deposit', amount: '', description: '' })}>
                    Record transaction
                  </button>
                )
              }
            >
              <div className={cd.listRow} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: MUTED }}>Held on this client's behalf</span>
                <span style={{ fontSize: 19, fontWeight: 600, color: '#1A1A17' }}>
                  {trustBalance === null ? '—' : money(trustBalance)}
                </span>
              </div>

              {trustForm && (
                <div className={cd.listRow} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={trustForm.type}
                      onChange={(e) => setTrustForm({ ...trustForm, type: e.target.value as 'deposit' | 'disbursement' })}
                      style={TRUST_INPUT}
                    >
                      <option value="deposit">Deposit</option>
                      <option value="disbursement">Disbursement</option>
                    </select>
                    <input
                      value={trustForm.amount}
                      onChange={(e) => setTrustForm({ ...trustForm, amount: e.target.value })}
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Amount"
                      style={TRUST_INPUT}
                    />
                  </div>
                  <input
                    value={trustForm.description}
                    onChange={(e) => setTrustForm({ ...trustForm, description: e.target.value })}
                    placeholder="What is this for?"
                    style={TRUST_INPUT}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className={cd.linkAction} onClick={() => setTrustForm(null)}>Cancel</button>
                    <button className={cd.linkAction} disabled={trustBusy} onClick={submitTrust}>
                      {trustBusy ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {trustForm.type === 'disbursement' && (
                    <div style={{ fontSize: 12, color: MUTED }}>
                      A disbursement can't take the balance below zero.
                    </div>
                  )}
                </div>
              )}

              {trustLedger.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {trustLedger.map((t) => (
                    <div key={t.id} className={cd.listRow}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div className={cd.rowTitle}>{TRUST_LABELS[t.type]}</div>
                        <span style={{ fontWeight: 600, flexShrink: 0, color: t.type === 'deposit' ? '#4A6B4E' : '#B3282D' }}>
                          {t.type === 'deposit' ? '+' : '−'}{money(t.amount)}
                        </span>
                      </div>
                      <div className={cd.metaRow}>
                        <span>{formatDate(t.transaction_date)}</span>
                        {t.description && <span>{t.description}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>No client money is being held for this client.</Empty>
              )}
            </Card>
          </div>

          <div className={cd.col}>
            <Card title="Hearings" count={hearings.length}>
              {hearings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hearings.map((h) => {
                    const [color, bg] = HEARING_STATUS_STYLE[h.hearing_status] || DEFAULT_STATUS_STYLE
                    return (
                      <div key={h.id} className={`${cd.listRow} ${cd.listRowLink}`} onClick={() => navigate(`/cases/${h.case_id}`)}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div className={cd.rowTitle}>{formatDate(h.hearing_date)}{h.hearing_time ? ` · ${h.hearing_time.slice(0, 5)}` : ''}</div>
                            <div className={cd.caseNumber} style={{ marginTop: 2 }}>{h.case_number ?? '—'}</div>
                          </div>
                          <span className={styles.statusBadge} style={{ color, background: bg, flexShrink: 0 }}>{h.hearing_status}</span>
                        </div>
                        <div className={cd.metaRow}>
                          <span>{h.court_name ?? 'Court not set'}</span>
                          {h.courtroom && <span>{h.courtroom}</span>}
                          {h.judge_name && <span>{h.judge_name}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty>No hearings scheduled for this client's cases.</Empty>
              )}
            </Card>

            <Card title="Invoices" count={invoices.length}>
              {invoices.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {invoices.map((inv) => {
                    const [color, bg] = INVOICE_STATUS_STYLE[inv.payment_status] || DEFAULT_STATUS_STYLE
                    return (
                      <div key={inv.id} className={cd.listRow}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div className={cd.rowTitle}>{moneyRound(inv.total_amount)}</div>
                            <div className={cd.caseNumber} style={{ marginTop: 2 }}>{inv.invoice_number}</div>
                          </div>
                          <span className={styles.statusBadge} style={{ color, background: bg, flexShrink: 0 }}>{inv.payment_status}</span>
                        </div>
                        <div className={cd.metaRow}>
                          <span>Issued {formatDate(inv.issue_date)}</span>
                          {inv.due_date && <span>Due {formatDate(inv.due_date)}</span>}
                          {inv.payment_status !== 'Paid' && (
                            <>
                              {trustBalance !== null && trustBalance > 0 && (
                                <button
                                  className={cd.linkAction}
                                  style={{ marginLeft: 'auto' }}
                                  disabled={trustBusy}
                                  onClick={() => payFromTrust(inv.id)}
                                >
                                  Pay from trust
                                </button>
                              )}
                              <button
                                className={cd.linkAction}
                                style={trustBalance !== null && trustBalance > 0 ? undefined : { marginLeft: 'auto' }}
                                onClick={() => navigate(`/billing/invoices/${inv.id}/record-payment`, { state: { from: `/clients/${id}` } })}
                              >
                                Record payment
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty>Nothing has been billed to this client yet.</Empty>
              )}
            </Card>
          </div>
        </div>

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </div>
  )
}
