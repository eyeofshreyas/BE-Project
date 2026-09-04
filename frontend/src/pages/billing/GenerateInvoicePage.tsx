/** `/billing/invoices/generate` route: full-page invoice builder (client/case, line items, discount/GST) with a live invoice preview, submitting via `createInvoice()`. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCases, listClients, createInvoice } from '../../api/client'
import type { CaseSummary, ClientSummary } from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const PRIMARY = '#B08D3E'

type LineItem = { description: string; qty: string; rate: string }

function money(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function addDays(iso: string, days: number) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function fieldStyle(): React.CSSProperties {
  return { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF', fontFamily: 'inherit' }
}

export default function GenerateInvoicePage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [cases, setCases] = useState<CaseSummary[]>([])

  const [clientQuery, setClientQuery] = useState('')
  const [clientOpen, setClientOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null)
  const clientBoxRef = useRef<HTMLDivElement>(null)

  const [caseId, setCaseId] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState(addDays(today, 30))

  const [items, setItems] = useState<LineItem[]>([{ description: '', qty: '1', rate: '0' }])
  const [discountPct, setDiscountPct] = useState('0')
  const [gstPct, setGstPct] = useState('18')
  const [notes, setNotes] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [invoiceNumber] = useState(() => `INV-${Date.now().toString().slice(-6)}`)

  useEffect(() => {
    listClients().then(setClients).catch(() => {})
    listCases().then(setCases).catch(() => {})
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) setClientOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function back() {
    navigate('/billing')
  }

  function pickClient(c: ClientSummary) {
    setSelectedClient(c)
    setClientQuery(c.full_name)
    setClientOpen(false)
    setCaseId('')
  }

  function addItem() {
    setItems((prev) => [...prev, { description: '', qty: '1', rate: '0' }])
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof LineItem, value: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)))
  }

  function saveDraft() {
    setToast('Draft saving isn’t available yet — generate the invoice or come back later.')
    setTimeout(() => setToast(null), 3000)
  }

  const availableCases = selectedClient ? cases.filter((c) => c.client === selectedClient.full_name) : cases
  const selectedCase = cases.find((c) => String(c.case_id) === caseId) ?? null

  const parsedItems = items.map((it) => ({ ...it, amount: (Number(it.qty) || 0) * (Number(it.rate) || 0) }))
  const subtotal = parsedItems.reduce((s, it) => s + it.amount, 0)
  const discountAmt = subtotal * ((Number(discountPct) || 0) / 100)
  const afterDiscount = subtotal - discountAmt
  const gstAmt = afterDiscount * ((Number(gstPct) || 0) / 100)
  const totalDue = afterDiscount + gstAmt

  async function submit() {
    if (!selectedCase) { setError('Choose a case / matter.'); return }
    if (!items.some((it) => it.description.trim() && Number(it.rate) > 0)) { setError('Add at least one line item with a description and rate.'); return }
    if (!dueDate) { setError('Choose a due date.'); return }
    setSaving(true)
    setError('')
    try {
      await createInvoice({
        case_id: selectedCase.case_id,
        invoice_number: invoiceNumber,
        amount: afterDiscount,
        tax: gstAmt,
        total_amount: totalDue,
        issue_date: invoiceDate,
        due_date: dueDate,
        remarks: notes.trim() || undefined,
      })
      navigate('/billing', { state: { toast: 'Invoice generated.' } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div onClick={back} style={{ cursor: 'pointer', color: MUTED, width: 30, height: 30, borderRadius: '50%', border: '1px solid #E7DCC6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icon name="chevron-down" size={14} strokeWidth={2.2} /></span>
              </div>
              <div className={styles.title}>Generate Invoice</div>
            </div>
            <div className={styles.subtitle} style={{ marginLeft: 40 }}>Create a new billable document for your client.</div>
          </div>
          <span className={styles.statusBadge} style={{ color: '#8f6743', background: '#EFE4CB' }}>DRAFT STATUS</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Client Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div ref={clientBoxRef} style={{ position: 'relative' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Client Name</div>
                  <input
                    value={clientQuery}
                    onChange={(e) => { setClientQuery(e.target.value); setSelectedClient(null); setClientOpen(true) }}
                    onFocus={() => setClientOpen(true)}
                    placeholder="Search clients..."
                    style={fieldStyle()}
                  />
                  {clientOpen && clientQuery && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#FFFFFF', border: '1px solid #E7DCC6', borderRadius: 10, boxShadow: '0 10px 24px rgba(42,33,24,.12)', maxHeight: 200, overflowY: 'auto', zIndex: 20 }}>
                      {clients.filter((c) => c.full_name.toLowerCase().includes(clientQuery.toLowerCase())).map((c) => (
                        <div key={c.id} onClick={() => pickClient(c)} style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#2A2118' }}>
                          {c.full_name} <span style={{ color: MUTED, fontSize: 11.5 }}>· {c.email}</span>
                        </div>
                      ))}
                      {clients.filter((c) => c.full_name.toLowerCase().includes(clientQuery.toLowerCase())).length === 0 && (
                        <div style={{ padding: '8px 12px', fontSize: 13, color: MUTED }}>No matching clients.</div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Case / Matter</div>
                  <select value={caseId} onChange={(e) => setCaseId(e.target.value)} style={fieldStyle()}>
                    <option value="">Select active matter...</option>
                    {availableCases.map((c) => <option key={c.case_id} value={c.case_id}>{c.id} — {c.case_title ?? c.client ?? 'Untitled'}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Invoice Date</div>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={fieldStyle()} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>Due Date</div>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={fieldStyle()} />
                </div>
              </div>
            </div>

            <div className={styles.panelCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className={styles.panelTitle} style={{ margin: 0 }}>Line Items</div>
                <div className={styles.ghostChip} style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={addItem}><Icon name="plus" size={13} color="#6A5C42" /> Add Item</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px 28px', gap: 8, fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                  <div>Description</div><div>Qty / Hrs</div><div>Rate (₹)</div><div>Amount</div><div />
                </div>
                {parsedItems.map((it, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px 28px', gap: 8, alignItems: 'center' }}>
                    <input value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} style={fieldStyle()} />
                    <input type="number" min="0" value={it.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} style={fieldStyle()} />
                    <input type="number" min="0" value={it.rate} onChange={(e) => updateItem(i, 'rate', e.target.value)} style={fieldStyle()} />
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2118', textAlign: 'right' }}>{money(it.amount)}</div>
                    <div onClick={() => items.length > 1 && removeItem(i)} style={{ cursor: items.length > 1 ? 'pointer' : 'default', opacity: items.length > 1 ? 1 : 0.3, display: 'flex', justifyContent: 'center' }}>
                      <Icon name="trash-2" size={15} color="#B05C5C" />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid #F1E9D9', marginTop: 16, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13.5 }}>
                  <span style={{ color: MUTED }}>Subtotal</span><strong>{money(subtotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13.5 }}>
                  <span style={{ color: MUTED }}>Discount (%)</span>
                  <input type="number" min="0" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} style={{ ...fieldStyle(), width: 90 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13.5 }}>
                  <span style={{ color: MUTED }}>GST (%)</span>
                  <input type="number" min="0" max="100" value={gstPct} onChange={(e) => setGstPct(e.target.value)} style={{ ...fieldStyle(), width: 90 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16, fontWeight: 700, borderTop: '1px solid #F1E9D9', paddingTop: 10 }}>
                  <span>Total Due</span><span>{money(totalDue)}</span>
                </div>
              </div>
            </div>

            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Notes / Payment Terms</div>
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Payable within 30 days by NEFT to the firm account. Fees exclude court and filing charges."
                style={{ ...fieldStyle(), minHeight: 80, resize: 'vertical' }}
              />
            </div>

            {error && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{error}</div>}

            <div style={{ position: 'sticky', bottom: 0, background: '#2A2118', borderRadius: 14, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={back} style={{ color: '#D8C9A8', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className={styles.ghostChip} style={{ background: 'transparent', borderColor: '#5A4C3A', color: '#FFFFFF' }} onClick={saveDraft}>Save Draft</div>
                <div className={styles.primaryChip} style={{ opacity: saving ? 0.7 : 1, pointerEvents: saving ? 'none' : 'auto' }} onClick={submit}>
                  {saving ? 'Generating…' : 'Generate Invoice'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ position: 'sticky', top: 20 }}>
            <div className={styles.panelCard} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #F1E9D9' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Live Preview</span>
                <Icon name="eye" size={15} color={MUTED} />
              </div>
              <div style={{ position: 'relative', padding: 20, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%) rotate(-24deg)', fontSize: 46, fontWeight: 800, color: 'rgba(176,141,62,.12)', letterSpacing: '.1em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>DRAFT</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, fontWeight: 700, color: '#2A2118' }}>LexFlow</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '.05em' }}>INVOICE</div>
                </div>
                <div style={{ fontSize: 11.5, color: PRIMARY, fontWeight: 600, marginTop: 2 }}>{selectedCase?.lawyer ?? 'No lawyer assigned'}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{selectedCase?.lawyer_phone ?? '—'}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{selectedCase?.lawyer_email ?? '—'}</div>
                <div style={{ fontSize: 10.5, color: MUTED, textAlign: 'right', marginTop: -34 }}>
                  <div>{invoiceNumber}</div>
                  <div>{formatDate(invoiceDate)}</div>
                </div>

                <div style={{ borderTop: '1px solid #F1E9D9', marginTop: 14, paddingTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Bill To</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2118', marginTop: 3 }}>{selectedClient?.full_name ?? 'Client name'}</div>
                  <div style={{ fontSize: 11.5, color: MUTED }}>{selectedClient?.email ?? 'client@email.com'}</div>
                  <div style={{ fontSize: 11.5, color: '#2A2118', fontWeight: 600, marginTop: 4 }}>Matter: {selectedCase ? (selectedCase.case_title ?? selectedCase.id) : 'No matter selected'}</div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 60px 70px', gap: 6, fontSize: 9.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid #F1E9D9', paddingBottom: 6 }}>
                    <div>Description</div><div>Hrs</div><div>Rate</div><div style={{ textAlign: 'right' }}>Amount</div>
                  </div>
                  {parsedItems.filter((it) => it.description.trim()).map((it, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 60px 70px', gap: 6, fontSize: 11.5, padding: '7px 0', borderBottom: '1px solid #F8F2E4' }}>
                      <div style={{ color: PRIMARY, fontWeight: 600 }}>{it.description}</div>
                      <div style={{ color: MUTED }}>{it.qty}</div>
                      <div style={{ color: MUTED }}>{money(Number(it.rate) || 0).replace('.00', '')}</div>
                      <div style={{ textAlign: 'right', fontWeight: 600 }}>{money(it.amount).replace('.00', '')}</div>
                    </div>
                  ))}
                  {parsedItems.filter((it) => it.description.trim()).length === 0 && (
                    <div style={{ fontSize: 11.5, color: MUTED, padding: '8px 0' }}>No line items yet.</div>
                  )}
                </div>

                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: MUTED }}><span>Subtotal</span><span>{money(subtotal).replace('.00', '')}</span></div>
                  {Number(discountPct) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: MUTED }}><span>Discount ({discountPct}%)</span><span>-{money(discountAmt).replace('.00', '')}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: MUTED }}><span>GST ({gstPct}%)</span><span>{money(gstAmt).replace('.00', '')}</span></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid #E7DCC6', marginTop: 10, paddingTop: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#2A2118' }}>Total Due</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#2A2118' }}>{money(totalDue).replace('.00', '')}</span>
                </div>
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>Due {formatDate(dueDate)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
