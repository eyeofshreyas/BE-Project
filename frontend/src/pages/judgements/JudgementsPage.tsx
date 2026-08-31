import { useEffect, useState } from 'react'
import { listJudgements, createJudgement, listCases } from '../../api/client'
import type { JudgementSummary, JudgementOutcome, CaseSummary } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const PRIMARY = '#B08D3E'
const OUTCOMES: JudgementOutcome[] = ['Favourable', 'Partly Favourable', 'Against', 'Settled']
const OUTCOME_STYLE: Record<JudgementOutcome, [string, string]> = {
  Favourable: ['#2E9E58', '#E4F5EA'],
  'Partly Favourable': ['#B87F1E', '#FFF2E0'],
  Against: ['#B05C5C', '#FBEAEA'],
  Settled: ['#6A5C42', '#EFEAE1'],
}

function money(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString()}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function monthsBetween(a: string, b: string) {
  const diffDays = (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  return diffDays / 30.44
}

export default function JudgementsPage() {
  const [judgements, setJudgements] = useState<JudgementSummary[]>([])
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'All' | JudgementOutcome>('All')

  const [formOpen, setFormOpen] = useState(false)
  const [caseId, setCaseId] = useState('')
  const [citation, setCitation] = useState('')
  const [court, setCourt] = useState('')
  const [bench, setBench] = useState('')
  const [judgementDate, setJudgementDate] = useState('')
  const [outcome, setOutcome] = useState<JudgementOutcome>('Favourable')
  const [summary, setSummary] = useState('')
  const [reliefText, setReliefText] = useState('')
  const [reliefAmount, setReliefAmount] = useState('')
  const [appealStatus, setAppealStatus] = useState('')
  const [tags, setTags] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    refresh()
    listCases().then(setCases).catch(() => {})
  }, [])

  function refresh() {
    setLoading(true)
    listJudgements()
      .then(setJudgements)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load judgements.'))
      .finally(() => setLoading(false))
  }

  function openForm() {
    setFormOpen(true)
    setCaseId('')
    setCitation('')
    setCourt('')
    setBench('')
    setJudgementDate('')
    setOutcome('Favourable')
    setSummary('')
    setReliefText('')
    setReliefAmount('')
    setAppealStatus('')
    setTags('')
    setFormError('')
  }

  async function submitForm() {
    if (!caseId || !citation.trim() || !court.trim() || !bench.trim() || !judgementDate || !summary.trim()) {
      setFormError('Fill in case, citation, court, bench, date and summary.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const created = await createJudgement({
        case_id: Number(caseId),
        citation: citation.trim(),
        court: court.trim(),
        bench: bench.trim(),
        judgement_date: judgementDate,
        outcome,
        summary: summary.trim(),
        relief_text: reliefText.trim() || undefined,
        relief_amount: reliefAmount ? Number(reliefAmount) : undefined,
        appeal_status: appealStatus.trim() || undefined,
        tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      })
      setJudgements((prev) => [created, ...prev])
      setFormOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save judgement.')
    } finally {
      setSaving(false)
    }
  }

  const searchLower = search.toLowerCase()
  const filtered = judgements.filter((j) =>
    (outcomeFilter === 'All' || j.outcome === outcomeFilter) &&
    (!searchLower ||
      j.citation.toLowerCase().includes(searchLower) ||
      j.court.toLowerCase().includes(searchLower) ||
      (j.case_title ?? '').toLowerCase().includes(searchLower))
  )

  const wonCount = judgements.filter((j) => j.outcome === 'Favourable').length
  const partWonCount = judgements.filter((j) => j.outcome === 'Partly Favourable').length
  const successRate = judgements.length ? Math.round(((wonCount + partWonCount) / judgements.length) * 100) : 0

  const durations = judgements
    .filter((j) => j.filing_date)
    .map((j) => monthsBetween(j.filing_date as string, j.judgement_date))
  const avgMonths = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0

  const reliefRows = judgements.filter((j) => j.relief_amount != null)
  const totalRelief = reliefRows.reduce((s, j) => s + (j.relief_amount ?? 0), 0)

  const statCards = [
    { label: 'Judgements on Record', value: String(judgements.length).padStart(2, '0'), sub: `${judgements.length} on file`, icon: 'gavel' as const },
    { label: 'Success Rate', value: `${successRate}%`, sub: `${wonCount} won · ${partWonCount} part-won`, icon: 'bar-chart-2' as const },
    { label: 'Avg. Time to Judgement', value: `${avgMonths} mo`, sub: 'Filing to pronouncement', icon: 'clock' as const },
    { label: 'Relief Recovered', value: money(totalRelief), sub: `Across ${reliefRows.length} money decrees`, icon: 'receipt' as const },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Judgements</div>
            <div className={styles.subtitle}>Every judgement already pronounced in the firm's matters — what was held, by which bench, and what it recovered. Open one for the reasoning and the appeal position.</div>
          </div>
          <div className={styles.primaryChip} onClick={openForm}><Icon name="plus" size={15} color="#FFFFFF" /> Add Judgement</div>
        </div>

        <div className={styles.statCards}>
          {statCards.map((s) => (
            <div key={s.label} className={styles.statCard} style={{ gap: 4 }}>
              <div className={styles.statIconRow}>
                <div className={styles.statIconWrap}><Icon name={s.icon} size={18} color={PRIMARY} /></div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>{s.label}</span>
              </div>
              <div className={styles.statValue}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: MUTED }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input
            placeholder="Search by citation, court, client, or issue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240, padding: '9px 14px', borderRadius: 10, border: '1px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF' }}
          />
          <div style={{ display: 'flex', gap: 4, background: '#EFE4CB', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
            {(['All', ...OUTCOMES] as const).map((f) => {
              const count = f === 'All' ? judgements.length : judgements.filter((j) => j.outcome === f).length
              return (
                <div
                  key={f}
                  onClick={() => setOutcomeFilter(f)}
                  style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', color: outcomeFilter === f ? '#2A2118' : '#6A5C42', background: outcomeFilter === f ? '#FFFFFF' : 'transparent' }}
                >
                  {f} ({count})
                </div>
              )
            })}
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading judgements…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filtered.map((j) => {
              const [color, bg] = OUTCOME_STYLE[j.outcome]
              return (
                <div key={j.id} className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="gavel" size={18} color={PRIMARY} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#2A2118' }}>{j.case_title ?? j.case_number ?? 'Untitled matter'}</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{j.citation} · {j.court} · {formatDate(j.judgement_date)}</div>
                      </div>
                    </div>
                    <span className={styles.statusBadge} style={{ color, background: bg, whiteSpace: 'nowrap' }}>{j.outcome}</span>
                  </div>

                  <div style={{ fontSize: 13.5, color: '#3D3126' }}>{j.summary}</div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, borderTop: '1px solid #F1E9D9', paddingTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Bench</div>
                      <div style={{ fontSize: 13, color: '#2A2118', marginTop: 2 }}>{j.bench}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Relief</div>
                      <div style={{ fontSize: 13, color: '#2A2118', marginTop: 2 }}>
                        {j.relief_amount != null ? money(j.relief_amount) : ''}{j.relief_amount != null && j.relief_text ? ' ' : ''}{j.relief_text ?? (j.relief_amount == null ? '—' : '')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Case</div>
                      <div className={styles.tdMono} style={{ fontSize: 13, marginTop: 2 }}>{j.case_number ?? '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.03em' }}>Appeal</div>
                      <div style={{ fontSize: 13, color: '#2A2118', marginTop: 2 }}>{j.appeal_status ?? '—'}</div>
                    </div>
                    {j.tags && j.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {j.tags.map((t) => <span key={t} className={styles.ghostChip} style={{ fontSize: 11.5, padding: '4px 10px' }}>{t}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className={styles.panelCard} style={{ color: MUTED, textAlign: 'center' }}>No judgements match your filters.</div>
            )}
          </div>
        )}

        {formOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={() => setFormOpen(false)}>
            <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 460, maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 20px 48px rgba(0,0,0,.2)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 700, color: '#2A2118', marginBottom: 16 }}>Add Judgement</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Case">
                  <select value={caseId} onChange={(e) => setCaseId(e.target.value)} style={inputStyle}>
                    <option value="">Select a case…</option>
                    {cases.map((c) => <option key={c.case_id} value={c.case_id}>{c.id} — {c.case_title ?? c.court}</option>)}
                  </select>
                </Field>
                <Field label="Citation"><input value={citation} onChange={(e) => setCitation(e.target.value)} style={inputStyle} placeholder="2026 SCC OnLine Bom 412" /></Field>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}><Field label="Court"><input value={court} onChange={(e) => setCourt(e.target.value)} style={inputStyle} /></Field></div>
                  <div style={{ flex: 1 }}><Field label="Date"><input type="date" value={judgementDate} onChange={(e) => setJudgementDate(e.target.value)} style={inputStyle} /></Field></div>
                </div>
                <Field label="Bench"><input value={bench} onChange={(e) => setBench(e.target.value)} style={inputStyle} placeholder="Justice A. R. Deshpande" /></Field>
                <Field label="Outcome">
                  <select value={outcome} onChange={(e) => setOutcome(e.target.value as JudgementOutcome)} style={inputStyle}>
                    {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Summary"><textarea value={summary} onChange={(e) => setSummary(e.target.value)} style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} /></Field>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}><Field label="Relief (text)"><input value={reliefText} onChange={(e) => setReliefText(e.target.value)} style={inputStyle} placeholder="Suit dismissed with costs" /></Field></div>
                  <div style={{ flex: 1 }}><Field label="Relief amount (₹)"><input type="number" min="0" value={reliefAmount} onChange={(e) => setReliefAmount(e.target.value)} style={inputStyle} /></Field></div>
                </div>
                <Field label="Appeal status"><input value={appealStatus} onChange={(e) => setAppealStatus(e.target.value)} style={inputStyle} placeholder="Closed / Appeal filed / Open till …" /></Field>
                <Field label="Tags (comma-separated)"><input value={tags} onChange={(e) => setTags(e.target.value)} style={inputStyle} placeholder="Property, Partition" /></Field>

                {formError && <div style={{ fontSize: 12.5, color: '#B05C5C' }}>{formError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <div className={styles.ghostChip} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setFormOpen(false)}>Cancel</div>
                  <div className={styles.primaryChip} style={{ flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1, pointerEvents: saving ? 'none' : 'auto' }} onClick={submitForm}>
                    {saving ? 'Saving…' : 'Save'}
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

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E7DCC6', fontSize: 13.5, background: '#FFFFFF', fontFamily: 'inherit' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#6A5C42', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}
