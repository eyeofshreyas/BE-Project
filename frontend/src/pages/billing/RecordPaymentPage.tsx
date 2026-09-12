/** `/billing/invoices/:invoiceId/record-payment` route: full-page form recording a payment against one invoice via `createPayment()`. */
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { getInvoice, createPayment } from '../../api/client'
import type { InvoiceSummary } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#6E6759'
const PRIMARY = '#23306B'
const PAYMENT_METHODS = ['Cash', 'Cheque / DD', 'In-Person Bank Transfer', 'POS Terminal']

function money(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function RecordPaymentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { invoiceId } = useParams()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/billing'
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState(PAYMENT_METHODS[0])
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getInvoice(Number(invoiceId))
      .then((inv) => { setInvoice(inv); setAmount(inv.total_amount.toFixed(2)) })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load invoice.'))
      .finally(() => setLoading(false))
  }, [invoiceId])

  function back() {
    navigate(backTo)
  }

  async function submit() {
    if (!invoice) return
    const value = Number(amount)
    if (!value || value <= 0) { setError('Enter a valid amount.'); return }
    if (!date) { setError('Choose a payment date.'); return }
    setSaving(true)
    setError('')
    try {
      await createPayment({
        invoice_id: invoice.id,
        amount: value,
        payment_method: method,
        transaction_reference: reference.trim() || undefined,
        payment_date: date,
      })
      navigate(backTo, { state: { toast: 'Payment recorded.' } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#1A2551', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }} onClick={back}>
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icon name="chevron-down" size={14} strokeWidth={2.2} /></span> Back
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading invoice…</div>}
        {loadError && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{loadError}</div>}

        {invoice && (
          <div className={styles.panelCard} style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 3, background: '#F3EBD9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="banknote" size={17} color={PRIMARY} />
                </div>
                <div className={styles.title} style={{ fontSize: 18 }}>Record Manual Payment</div>
              </div>
              <div onClick={back} style={{ cursor: 'pointer', color: MUTED, width: 30, height: 30, borderRadius: 3, border: '1px solid #CFC6B0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={16} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#575145', marginBottom: 5 }}>Invoice</div>
                <div style={{ border: '1.5px solid #CFC6B0', borderRadius: 3, padding: '9px 12px', fontSize: 13.5, fontWeight: 600, color: '#1A1A17' }}>
                  {invoice.invoice_number} — {invoice.client ?? 'No client'} — {money(invoice.total_amount)} due
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
                  {invoice.client ?? '—'} · {invoice.case_number ?? '—'} · Outstanding {money(invoice.total_amount)} of {money(invoice.total_amount)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#575145', marginBottom: 5 }}>Payment Amount Received (₹)</div>
                <input
                  type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div className={styles.ghostChip} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setAmount(invoice.total_amount.toFixed(2))}>Pay Full Balance</div>
                  <div className={styles.ghostChip} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setAmount((invoice.total_amount / 2).toFixed(2))}>50% Partial Payment</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#575145', marginBottom: 5 }}>Payment Method</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {PAYMENT_METHODS.map((m) => (
                    <div
                      key={m}
                      onClick={() => setMethod(m)}
                      style={{
                        textAlign: 'center', padding: '10px 8px', borderRadius: 3, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                        background: method === m ? PRIMARY : '#FCFAF4',
                        color: method === m ? '#FCFAF4' : '#1A1A17',
                        border: `1.5px solid ${method === m ? PRIMARY : '#CFC6B0'}`,
                      }}
                    >
                      {m}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#575145', marginBottom: 5 }}>Transaction Reference / Receipt No.</div>
                <input
                  value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. RCPT-4821 or cheque no."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5 }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#575145', marginBottom: 5 }}>Payment Date</div>
                <input
                  type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5 }}
                />
              </div>

              {error && <div style={{ fontSize: 12.5, color: '#B3282D' }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <div className={styles.ghostChip} style={{ flex: 1, justifyContent: 'center' }} onClick={back}>Cancel</div>
                <div className={styles.primaryChip} style={{ flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1, pointerEvents: saving ? 'none' : 'auto' }} onClick={submit}>
                  {saving ? 'Saving…' : 'Save Payment'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
