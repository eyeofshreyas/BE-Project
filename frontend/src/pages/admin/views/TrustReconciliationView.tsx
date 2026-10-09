/** Admin console "Trust" tab: the monthly 3-way reconciliation (`getTrustReconciliation()`)
 * plus the hand-entered bank figure it checks against (`createTrustBankStatement()`). */
import { useEffect, useState } from 'react'
import { C, pillStyle } from '../../../components/theme'
import { getTrustReconciliation, createTrustBankStatement } from '../../../api/client'
import type { TrustReconciliation } from '../../../types/api'
import { Icon } from '../../../components/icons'
import styles from '../../../components/AppShell.module.css'

const inputStyle = { padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5, minWidth: 0 }
const BTN_PRIMARY = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: C.primary, color: '#FCFAF4', boxShadow: '0 4px 12px rgba(35, 48, 107,.28)', display: 'flex', alignItems: 'center', gap: 6 }

const today = () => new Date().toISOString().slice(0, 10)

function money(n: number | null) {
  return n === null ? '—' : `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** One of the three totals, with the gap against the figure it has to match. */
function Leg({ label, value, note, diff }: { label: string; value: number | null; note: string; diff?: number }) {
  const off = diff !== undefined && Math.abs(diff) >= 0.01
  return (
    <div style={{ flex: 1, minWidth: 190, padding: '14px 16px', border: `1.5px solid ${off ? '#E4B9BB' : '#E6E0CE'}`, borderRadius: 3, background: off ? '#FBF1F1' : '#FCFAF4' }}>
      <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, color: '#8C857A' }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 600, color: '#1A1A17', marginTop: 4 }}>{money(value)}</div>
      <div style={{ fontSize: 12, color: off ? C.danger : '#8C857A', marginTop: 4 }}>
        {off ? `Off by ${money(Math.abs(diff))}` : note}
      </div>
    </div>
  )
}

export default function TrustReconciliationView() {
  const [asOf, setAsOf] = useState(today)
  const [report, setReport] = useState<TrustReconciliation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bankBalance, setBankBalance] = useState('')
  const [saving, setSaving] = useState(false)

  async function run(date = asOf) {
    setLoading(true)
    setError('')
    try {
      setReport(await getTrustReconciliation(date))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run the reconciliation.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { run(today()) }, [])

  async function recordBankBalance() {
    const value = Number(bankBalance)
    if (!(value >= 0)) { setError('Enter the balance shown on the bank statement.'); return }
    setSaving(true)
    setError('')
    try {
      await createTrustBankStatement({ statement_date: asOf, bank_balance: value })
      setBankBalance('')
      await run()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record that balance.')
    } finally {
      setSaving(false)
    }
  }

  const bankGap = report && report.bank_balance !== null ? report.bank_balance - report.ledger_total : undefined
  const clientGap = report ? report.client_total - report.ledger_total : undefined

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Trust Reconciliation</div>
        <div className={styles.pageSubtitle}>
          Three numbers that must agree: what the bank says the trust account holds, what the
          firm's ledger says, and what every client's balance adds up to. If they don't,
          client money has moved somewhere it shouldn't have.
        </div>
      </div>

      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#575145' }}>As of</label>
          <input type="date" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} style={inputStyle} />
          <div style={{ ...BTN_PRIMARY, opacity: loading ? 0.6 : 1 }} onClick={loading ? undefined : () => run()}>
            <Icon name="search" size={15} color="#FCFAF4" /> {loading ? 'Running…' : 'Run'}
          </div>
          <div style={{ width: 1, height: 26, background: '#E6E0CE', margin: '0 4px' }} />
          <input
            value={bankBalance}
            onChange={(e) => setBankBalance(e.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="Bank statement balance"
            style={{ ...inputStyle, width: 190 }}
          />
          <div
            className={styles.chipBase}
            style={{ background: '#F1EDE0', color: '#575145', opacity: saving || !bankBalance ? 0.6 : 1 }}
            onClick={saving || !bankBalance ? undefined : recordBankBalance}
          >
            {saving ? 'Saving…' : 'Record bank balance'}
          </div>
        </div>
        {error && <div style={{ marginTop: 12, color: C.danger, fontSize: 13.5 }}>{error}</div>}
      </div>

      {report && (
        <>
          <div className={styles.card}>
            <div className={styles.cardHeadRow}>
              <div className={styles.cardTitle}>As of {report.as_of}</div>
              <span className={styles.pill} style={pillStyle(report.reconciled ? C.success : C.danger)}>
                {report.reconciled ? 'Reconciled' : 'Does not reconcile'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <Leg
                label="1 · Bank statement"
                value={report.bank_balance}
                note={report.bank_statement_date ? `Statement of ${report.bank_statement_date}` : 'No statement recorded yet'}
                diff={bankGap}
              />
              <Leg label="2 · Firm ledger" value={report.ledger_total} note="Control total, as recorded at posting" />
              <Leg label="3 · Client balances" value={report.client_total} note={`${report.client_balances.length} client${report.client_balances.length === 1 ? '' : 's'}`} diff={clientGap} />
            </div>
            {!report.reconciled && report.bank_balance === null && (
              <div style={{ marginTop: 12, fontSize: 13, color: C.muted }}>
                Enter the balance from the bank statement above to complete the check.
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeadRow}>
              <div className={styles.cardTitle}>Client balances</div>
            </div>
            {report.client_balances.length === 0 ? (
              <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>No client money held as of this date.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Client</th>
                      <th className={styles.th}>Balance held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.client_balances.map((c) => (
                      <tr key={c.client_id} className={styles.tr}>
                        <td className={styles.td} style={{ color: '#33302A' }}>#{c.client_id}</td>
                        <td className={styles.td} style={{ fontWeight: 600, color: c.balance < 0 ? C.danger : '#1A1A17' }}>{money(c.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
