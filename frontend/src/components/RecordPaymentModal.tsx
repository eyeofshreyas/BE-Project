/** Shared "Record Manual Payment" modal used from Billing and Clients: records a payment against one invoice via `createPayment()`. */
import { useState } from 'react'
import { createPayment } from '../api/client'
import type { InvoiceSummary } from '../types/api'
import { Icon } from './icons'
import styles from '../pages/conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const PRIMARY = '#B08D3E'
const PAYMENT_METHODS = ['Cash', 'Cheque / DD', 'In-Person Bank Transfer', 'POS Terminal']

function money(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function RecordPaymentModal({ invoice, onClose, onSaved }: { invoice: InvoiceSummary; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(invoice.total_amount.toFixed(2))
  const [method, setMethod] = useState(PAYMENT_METHODS[0])
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
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
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 440, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 48px rgba(0,0,0,.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 700, color: '#2A2118', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="banknote" size={16} color={PRIMARY} /> Record Manual Payment
          </div>
          <div onClick={onClose} style={{ cursor: 'pointer', color: MUTED }}><Icon name="x" size={16} /></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Invoice</div>
            <div style={{ border: '1.5px solid #E7DCC6', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>
              {invoice.invoice_number} — {invoice.client ?? 'No client'} — {money(invoice.total_amount)} due
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
              {invoice.client ?? '—'} · {invoice.case_number ?? '—'} · Outstanding {money(invoice.total_amount)} of {money(invoice.total_amount)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Payment Amount Received (₹)</div>
            <input
              type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div className={styles.ghostChip} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setAmount(invoice.total_amount.toFixed(2))}>Pay Full Balance</div>
              <div className={styles.ghostChip} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setAmount((invoice.total_amount / 2).toFixed(2))}>50% Partial Payment</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Payment Method</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {PAYMENT_METHODS.map((m) => (
                <div
                  key={m}
                  onClick={() => setMethod(m)}
                  style={{
                    textAlign: 'center', padding: '10px 8px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    background: method === m ? PRIMARY : '#FFFFFF',
                    color: method === m ? '#FFFFFF' : '#2A2118',
                    border: `1.5px solid ${method === m ? PRIMARY : '#E7DCC6'}`,
                  }}
                >
                  {m}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Transaction Reference / Receipt No.</div>
            <input
              value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. RCPT-4821 or cheque no."
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Payment Date</div>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5 }}
            />
          </div>

          {error && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <div className={styles.ghostChip} style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</div>
            <div className={styles.primaryChip} style={{ flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1, pointerEvents: saving ? 'none' : 'auto' }} onClick={submit}>
              {saving ? 'Saving…' : 'Save Payment'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
