/** `/clients/:clientId` route (lawyer/admin): one client's record -- contact facts, the cases
 * they're on, and their invoices. Reads an optional `location.state.toast` (set by
 * `RecordPaymentPage` when it navigates back here). */
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { listClients, listCases, listInvoices, getOrCreateConversation } from '../../api/client'
import type { ClientSummary, CaseSummary, InvoiceSummary } from '../../types/api'
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
const INVOICE_STATUS_STYLE: Record<string, [string, string]> = {
  Paid: ['#4A6B4E', '#E4EDE5'],
  'Partially Paid': ['#8A6A2F', '#F3EBD9'],
  Pending: ['#8A6A2F', '#F3EBD9'],
  Overdue: ['#B3282D', '#F7E4E5'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#575145', '#F0ECDF']

function statusLabel(s: string) {
  return s === 'Open' ? 'Active' : s
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function moneyRound(n: number) {
  return `₹${Math.round(n).toLocaleString()}`
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messaging, setMessaging] = useState(false)
  const [toast, setToast] = useState<string | null>((location.state as { toast?: string } | null)?.toast ?? null)

  useEffect(() => {
    if (!id) { setError('Invalid client.'); setLoading(false); return }
    Promise.all([listClients(), listCases(), listInvoices()])
      .then(([clients, allCases, allInvoices]) => {
        const found = clients.find((c) => c.id === id)
        if (!found) { setError("This client doesn't exist or you don't have access to them."); return }
        setClient(found)
        const theirCases = allCases.filter((c) => c.client_id === id)
        setCases(theirCases)
        // invoices carry the case_number string, which is CaseSummary.id
        const caseNumbers = new Set(theirCases.map((c) => c.id))
        setInvoices(allInvoices.filter((inv) => inv.case_number && caseNumbers.has(inv.case_number)))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this client.'))
      .finally(() => setLoading(false))
  }, [id])

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
                      <div key={c.case_id} className={cd.listRow} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cases/${c.case_id}`)}>
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
          </div>

          <div className={cd.col}>
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
                            <button
                              className={cd.linkAction}
                              style={{ marginLeft: 'auto' }}
                              onClick={() => navigate(`/billing/invoices/${inv.id}/record-payment`, { state: { from: `/clients/${id}` } })}
                            >
                              Record payment
                            </button>
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
