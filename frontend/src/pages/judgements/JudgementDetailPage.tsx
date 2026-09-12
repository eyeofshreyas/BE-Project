/** `/judgements/:judgementId` route: one pronounced judgement in full -- what was held, the
 * reasoning, and the citation/court/relief grid. There's no single-judgement GET endpoint, so
 * this loads `listJudgements()` and finds its row, the same way `CaseDetailPage` does. */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listJudgements } from '../../api/client'
import type { JudgementSummary, JudgementOutcome } from '../../types/api'
import { Icon } from '../../components/icons'
import { formatDate } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#6E6759'
const PRIMARY = '#23306B'
const OUTCOME_STYLE: Record<JudgementOutcome, [string, string]> = {
  Favourable: ['#4A6B4E', '#E4EDE5'],
  'Partly Favourable': ['#8A6A2F', '#F3EBD9'],
  Against: ['#B3282D', '#F7E4E5'],
  Settled: ['#575145', '#F0ECDF'],
}

function money(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString()}`
}

function monthsBetween(a: string, b: string) {
  const diffDays = (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  return diffDays / 30.44
}

function GridCell({ label, value }: { label?: string; value?: React.ReactNode }) {
  return (
    <div style={{ background: '#F6F2E9', padding: '12px 14px' }}>
      {label && <div style={{ fontSize: 9.5, fontWeight: 700, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em' }}>{label}</div>}
      {value != null && <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1A17', marginTop: 4 }}>{value}</div>}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: MUTED, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.13em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: '#33302A', lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

export default function JudgementDetailPage() {
  const { judgementId } = useParams()
  const navigate = useNavigate()
  const numericId = Number(judgementId)

  const [judgement, setJudgement] = useState<JudgementSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!numericId) { setError('Invalid judgement.'); setLoading(false); return }
    listJudgements()
      .then((rows) => {
        const found = rows.find((r) => r.id === numericId)
        if (!found) { setError("This judgement doesn't exist or you don't have access to it."); return }
        setJudgement(found)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this judgement.'))
      .finally(() => setLoading(false))
  }, [numericId])

  if (loading) return <div className={styles.page}><div className={styles.wrap}><div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading judgement…</div></div></div>
  if (error || !judgement) return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>
        <div className={styles.ghostChip} style={{ width: 'fit-content' }} onClick={() => navigate('/judgements')}>Back to judgements</div>
      </div>
    </div>
  )

  const j = judgement
  const [color, bg] = OUTCOME_STYLE[j.outcome]
  const monthsCount = j.filing_date ? Math.round(monthsBetween(j.filing_date, j.judgement_date)) : null
  const timeToJudgement = monthsCount != null ? `${monthsCount} month${monthsCount === 1 ? '' : 's'}` : '—'
  const relief = j.relief_amount != null ? money(j.relief_amount) : (j.relief_text ?? '—')

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.breadcrumb}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/judgements')}>Judgements</span>
          <span>&rsaquo;</span>
          <span>{j.citation}</span>
        </div>

        <div className={styles.header}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="gavel" size={21} color={PRIMARY} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className={styles.title}>{j.case_title ?? j.case_number ?? 'Untitled matter'}</div>
              <div className={styles.subtitle}>{j.citation} · Pronounced {formatDate(j.judgement_date)}</div>
            </div>
          </div>
          <span className={styles.statusBadge} style={{ color, background: bg, whiteSpace: 'nowrap' }}>{j.outcome}</span>
        </div>

        <div className={styles.panelCard} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section label="Held">{j.summary}</Section>
          {j.reasoning && <Section label="Reasoning">{j.reasoning}</Section>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 1, background: '#CFC6B0', border: '1px solid #CFC6B0', borderRadius: 3, overflow: 'hidden', marginTop: 16 }}>
          <GridCell label="Citation" value={j.citation} />
          <GridCell label="Court" value={j.court} />
          <GridCell label="Bench" value={j.bench} />
          <GridCell label="Pronounced" value={formatDate(j.judgement_date)} />
          <GridCell label="Case Number" value={j.case_number ?? '—'} />
          <GridCell label="Client" value={j.client_name ?? '—'} />
          <GridCell label="Matter Type" value={j.matter_type ?? '—'} />
          <GridCell label="Relief" value={relief} />
          <GridCell label="Time to Judgement" value={timeToJudgement} />
          <GridCell label="Appeal Status" value={j.appeal_status ?? '—'} />
        </div>

        {j.tags && j.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
            {j.tags.map((t) => <span key={t} className={styles.ghostChip} style={{ fontSize: 11.5, padding: '4px 10px' }}>{t}</span>)}
          </div>
        )}

        {j.case_id && (
          <div style={{ marginTop: 20 }}>
            <div className={styles.ghostChip} style={{ width: 'fit-content' }} onClick={() => navigate(`/cases/${j.case_id}`)}>
              <Icon name="briefcase" size={15} color={MUTED} /> Open the case this came from
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
